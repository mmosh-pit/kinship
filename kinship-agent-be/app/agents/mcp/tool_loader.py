"""
Kinship Agent - MCP Tool Loader

Loads tools from MCP servers for a worker's tool list.
Handles the tool name → MCP server → tool definitions pipeline.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from app.agents.mcp.registry import mcp_tool_registry, MCPToolRegistry
from app.agents.mcp.client_pool import mcp_client_pool, MCPClientPool, MCPToolSchema


@dataclass
class LoadedMCPTool:
    """
    A tool loaded from an MCP server, ready for use.
    
    Contains both the schema (for LLM binding) and execution info.
    """
    name: str
    description: str
    input_schema: Dict[str, Any]
    server_url: str
    source_tool_name: str  # Original tool name from worker config (e.g., "twitter")


class MCPToolLoader:
    """
    Loads tools from MCP servers based on worker tool names.
    
    Flow:
    1. Worker has tools: ["twitter", "gmail"]
    2. Look up MCP server URLs from registry
    3. Connect to MCP servers
    4. Fetch available tools from each server
    5. Return combined list of LoadedMCPTool
    
    Usage:
        loader = MCPToolLoader()
        
        # Load tools for a worker
        tools = await loader.load_tools_for_worker(["twitter", "gmail"])
        
        # Each tool has schema and execution info
        for tool in tools:
            print(f"{tool.name}: {tool.description}")
            print(f"  Server: {tool.server_url}")
    """
    
    def __init__(
        self,
        registry: Optional[MCPToolRegistry] = None,
        client_pool: Optional[MCPClientPool] = None,
    ):
        """
        Initialize the tool loader.
        
        Args:
            registry: MCP tool registry (uses singleton if not provided)
            client_pool: MCP client pool (uses singleton if not provided)
        """
        self._registry = registry or mcp_tool_registry
        self._pool = client_pool or mcp_client_pool
    
    async def load_tools_for_worker(
        self,
        worker_tools: List[str],
    ) -> List[LoadedMCPTool]:
        """
        Load all tools for a worker from MCP servers.
        
        Args:
            worker_tools: List of tool names from Worker.tools
                         e.g., ["twitter", "gmail", "google_calendar"]
            
        Returns:
            List of LoadedMCPTool ready for LLM binding
        """
        if not worker_tools:
            return []
        
        # Group tools by MCP server URL
        servers, invalid_tools = self._registry.get_mcp_configs_for_tools(worker_tools)
        
        if invalid_tools:
            print(f"Warning: Invalid/unregistered tools skipped: {invalid_tools}")
        
        if not servers:
            print(f"Warning: No MCP servers found for tools: {worker_tools}")
            return []
        
        loaded_tools: List[LoadedMCPTool] = []
        
        # Load tools from each server
        for server_url, server_config in servers.items():
            try:
                server_tools = await self._load_from_server(
                    server_url=server_url,
                    source_tool_names=server_config["tools"],
                )
                loaded_tools.extend(server_tools)
            except Exception as e:
                print(f"Error loading tools from {server_url}: {e}")
                # Continue with other servers
        
        return loaded_tools
    
    async def _load_from_server(
        self,
        server_url: str,
        source_tool_names: List[str],
    ) -> List[LoadedMCPTool]:
        """
        Load tools from a specific MCP server.
        
        Args:
            server_url: MCP server URL
            source_tool_names: Tool names that map to this server
            
        Returns:
            List of LoadedMCPTool
        """
        # Get tools from the MCP server
        mcp_tools: List[MCPToolSchema] = await self._pool.get_tools(server_url)
        
        loaded: List[LoadedMCPTool] = []
        
        for mcp_tool in mcp_tools:
            # Determine which source tool name this belongs to
            # (In most cases, all tools from a server belong to the same source)
            source_name = source_tool_names[0] if source_tool_names else "unknown"
            
            loaded.append(LoadedMCPTool(
                name=mcp_tool.name,
                description=mcp_tool.description,
                input_schema=mcp_tool.input_schema,
                server_url=server_url,
                source_tool_name=source_name,
            ))
        
        return loaded
    
    async def load_single_tool(
        self,
        tool_name: str,
        mcp_tool_name: str,
    ) -> Optional[LoadedMCPTool]:
        """
        Load a specific tool by name.
        
        Args:
            tool_name: Tool name from worker config (e.g., "twitter")
            mcp_tool_name: Specific MCP tool name (e.g., "post_tweet")
            
        Returns:
            LoadedMCPTool or None if not found
        """
        server_url = self._registry.get_mcp_url(tool_name)
        
        if not server_url:
            return None
        
        mcp_tools = await self._pool.get_tools(server_url)
        
        for mcp_tool in mcp_tools:
            if mcp_tool.name == mcp_tool_name:
                return LoadedMCPTool(
                    name=mcp_tool.name,
                    description=mcp_tool.description,
                    input_schema=mcp_tool.input_schema,
                    server_url=server_url,
                    source_tool_name=tool_name,
                )
        
        return None
    
    async def execute_tool(
        self,
        loaded_tool: LoadedMCPTool,
        arguments: Dict[str, Any],
    ) -> Any:
        """
        Execute a loaded tool.
        
        Args:
            loaded_tool: The tool to execute
            arguments: Tool arguments
            
        Returns:
            Tool execution result
        """
        return await self._pool.execute_tool(
            url=loaded_tool.server_url,
            tool_name=loaded_tool.name,
            arguments=arguments,
        )
    
    async def execute_by_name(
        self,
        server_url: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """
        Execute a tool by name and server URL.
        
        Args:
            server_url: MCP server URL
            tool_name: Tool name
            arguments: Tool arguments
            
        Returns:
            Tool execution result
        """
        return await self._pool.execute_tool(
            url=server_url,
            tool_name=tool_name,
            arguments=arguments,
        )


# Singleton instance
mcp_tool_loader = MCPToolLoader()