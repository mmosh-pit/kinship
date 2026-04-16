"""
Kinship Agent - MCP Client Pool

Manages connections to MCP servers using the httpx-based streamable HTTP transport.
Provides connection pooling and reuse to minimize connection overhead.
"""

import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
import json

import httpx

from app.agents.cache.base import AsyncTTLCache
from app.core.config import cache_config


@dataclass
class MCPToolSchema:
    """Schema for an MCP tool."""
    name: str
    description: str
    input_schema: Dict[str, Any]  # JSON Schema for parameters


@dataclass
class MCPClientConnection:
    """Represents a connection to an MCP server."""
    url: str
    transport: str
    client: httpx.AsyncClient
    tools: List[MCPToolSchema] = field(default_factory=list)
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_used: datetime = field(default_factory=datetime.utcnow)
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


class MCPClientPool:
    """
    Pool of MCP client connections.
    
    Manages connections to MCP servers and caches them for reuse.
    Uses the streamable HTTP transport (JSON-RPC over HTTP).
    
    Usage:
        pool = MCPClientPool()
        
        # Get or create connection
        connection = await pool.get_connection(
            url="http://localhost:8001/mcp",
            transport="streamable_http"
        )
        
        # Execute a tool
        result = await pool.execute_tool(
            url="http://localhost:8001/mcp",
            tool_name="post_tweet",
            arguments={"content": "Hello world!"}
        )
        
        # Close all connections on shutdown
        await pool.close_all()
    """
    
    def __init__(self):
        """Initialize the client pool."""
        self._connections: Dict[str, MCPClientConnection] = {}
        self._lock = asyncio.Lock()
        
        # Cache for tools loaded from MCP servers
        self._tools_cache = AsyncTTLCache[List[MCPToolSchema]](
            max_size=cache_config.mcp_tools.max_size,
            ttl_seconds=cache_config.mcp_tools.ttl_seconds,
            name="mcp_tools_cache",
        )
        
        # Request ID counter for JSON-RPC
        self._request_id = 0
    
    def _next_request_id(self) -> int:
        """Get the next JSON-RPC request ID."""
        self._request_id += 1
        return self._request_id
    
    async def get_connection(
        self,
        url: str,
        transport: str = "streamable_http",
    ) -> MCPClientConnection:
        """
        Get or create a connection to an MCP server.
        
        Args:
            url: MCP server URL
            transport: Transport type (currently only "streamable_http" supported)
            
        Returns:
            MCPClientConnection
        """
        async with self._lock:
            if url in self._connections:
                conn = self._connections[url]
                conn.last_used = datetime.utcnow()
                return conn
            
            # Create new connection
            client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=10.0),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
            
            connection = MCPClientConnection(
                url=url,
                transport=transport,
                client=client,
            )
            
            # Try to initialize and fetch tools
            try:
                tools = await self._fetch_tools(connection)
                connection.tools = tools
            except Exception as e:
                print(f"Warning: Failed to fetch tools from {url}: {e}")
                # Continue anyway - tools will be fetched on demand
            
            self._connections[url] = connection
            return connection
    
    async def _send_jsonrpc(
        self,
        connection: MCPClientConnection,
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Send a JSON-RPC request to the MCP server.
        
        Args:
            connection: MCP client connection
            method: JSON-RPC method name
            params: Method parameters
            
        Returns:
            Result from the server
            
        Raises:
            Exception on error
        """
        request_id = self._next_request_id()
        
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        
        if params:
            payload["params"] = params
        
        response = await connection.client.post(
            connection.url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        
        response.raise_for_status()
        
        data = response.json()
        
        if "error" in data:
            error = data["error"]
            raise Exception(f"MCP error: {error.get('message', 'Unknown error')}")
        
        return data.get("result")
    
    async def _fetch_tools(
        self,
        connection: MCPClientConnection,
    ) -> List[MCPToolSchema]:
        """
        Fetch available tools from an MCP server.
        
        Args:
            connection: MCP client connection
            
        Returns:
            List of MCPToolSchema
        """
        # Check cache first
        cached = self._tools_cache.get(connection.url)
        if cached is not None:
            return cached
        
        # Call tools/list method
        result = await self._send_jsonrpc(connection, "tools/list")
        
        tools = []
        for tool_data in result.get("tools", []):
            tool = MCPToolSchema(
                name=tool_data.get("name", ""),
                description=tool_data.get("description", ""),
                input_schema=tool_data.get("inputSchema", {}),
            )
            tools.append(tool)
        
        # Cache the tools
        self._tools_cache.set(connection.url, tools)
        
        return tools
    
    async def get_tools(self, url: str) -> List[MCPToolSchema]:
        """
        Get available tools from an MCP server.
        
        Args:
            url: MCP server URL
            
        Returns:
            List of MCPToolSchema
        """
        connection = await self.get_connection(url)
        return await self._fetch_tools(connection)
    
    async def execute_tool(
        self,
        url: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """
        Execute a tool on an MCP server.
        
        Args:
            url: MCP server URL
            tool_name: Name of the tool to execute
            arguments: Tool arguments
            
        Returns:
            Tool execution result
        """
        connection = await self.get_connection(url)
        
        result = await self._send_jsonrpc(
            connection,
            "tools/call",
            {
                "name": tool_name,
                "arguments": arguments,
            },
        )
        
        # MCP tools return content array
        content = result.get("content", [])
        
        if not content:
            return None
        
        # Extract text content
        text_parts = []
        for item in content:
            if item.get("type") == "text":
                text_parts.append(item.get("text", ""))
        
        if len(text_parts) == 1:
            # Try to parse as JSON
            try:
                return json.loads(text_parts[0])
            except json.JSONDecodeError:
                return text_parts[0]
        
        return "\n".join(text_parts) if text_parts else content
    
    async def close_connection(self, url: str) -> bool:
        """
        Close a specific connection.
        
        Args:
            url: MCP server URL
            
        Returns:
            True if connection was closed, False if not found
        """
        async with self._lock:
            if url in self._connections:
                conn = self._connections.pop(url)
                await conn.close()
                return True
            return False
    
    async def close_all(self):
        """Close all connections."""
        async with self._lock:
            for conn in self._connections.values():
                try:
                    await conn.close()
                except Exception as e:
                    print(f"Error closing connection to {conn.url}: {e}")
            self._connections.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get pool statistics.
        
        Returns:
            Dict with connection info and cache stats
        """
        return {
            "active_connections": len(self._connections),
            "connection_urls": list(self._connections.keys()),
            "tools_cache": self._tools_cache.get_stats(),
        }


# Singleton instance
mcp_client_pool = MCPClientPool()
