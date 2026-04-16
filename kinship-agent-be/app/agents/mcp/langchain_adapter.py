"""
Kinship Agent - LangChain MCP Adapter

Uses langchain_mcp_adapters.MultiServerMCPClient for MCP tool integration.
This is the proven approach from langgraph_workflow.py.

DEBUG VERSION: Contains extensive print statements for troubleshooting.
UPDATED: Now supports passing authorization headers to MCP tools.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from langchain_core.tools import BaseTool

from app.agents.mcp.registry import mcp_tool_registry
from app.core.config import mcp_tools_config

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MCP Tools Cache
# ─────────────────────────────────────────────────────────────────────────────

_mcp_tools_cache: Dict[str, Dict[str, Any]] = {}
_mcp_client_cache: Dict[str, Any] = {}

# Cache TTL in seconds
MCP_CACHE_TTL = 300  # 5 minutes


def _get_cache_key(tool_names: List[str], auth_token: Optional[str] = None) -> str:
    """Generate cache key from tool names and auth token."""
    # Include auth token hash in cache key so different users get their own tools
    base_key = "|".join(sorted(tool_names))
    if auth_token:
        # Use a hash of the token for the cache key (first 8 chars)
        import hashlib
        token_hash = hashlib.sha256(auth_token.encode()).hexdigest()[:8]
        return f"{base_key}|{token_hash}"
    return base_key


def _is_cache_valid(cached: Dict[str, Any]) -> bool:
    """Check if cached entry is still valid."""
    if not cached:
        return False
    timestamp = cached.get("timestamp", 0)
    return (datetime.now().timestamp() - timestamp) < MCP_CACHE_TTL


# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────────────────────


async def load_and_convert_tools(
    worker_tools: List[str],
    auth_token: Optional[str] = None,
    mcp_headers: Optional[Dict[str, str]] = None,
) -> List[BaseTool]:
    """
    Load tools from MCP servers and convert to LangChain format.
    
    Args:
        worker_tools: List of tool names from Worker.tools
                     e.g., ["solana", "bluesky"]
        auth_token: Authorization token for authenticated MCP calls
        mcp_headers: Full headers dict for MCP calls
    """
    print(f"\n{'='*70}")
    print(f"[MCP ADAPTER] load_and_convert_tools() CALLED")
    print(f"[MCP ADAPTER] Input worker_tools: {worker_tools}")
    print(f"[MCP ADAPTER] auth_token: {auth_token[:20] if auth_token else 'None'}...")
    print(f"[MCP ADAPTER] mcp_headers: {list(mcp_headers.keys()) if mcp_headers else 'None'}")
    print(f"{'='*70}")
    
    if not worker_tools:
        print("[MCP ADAPTER] ❌ ERROR: worker_tools is empty/None - returning []")
        return []
    
    # Import langchain_mcp_adapters
    print("\n[MCP ADAPTER] Step 1: Importing langchain_mcp_adapters...")
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
        print(f"[MCP ADAPTER] ✅ Import SUCCESS - MultiServerMCPClient: {MultiServerMCPClient}")
    except ImportError as e:
        print(f"[MCP ADAPTER] ❌ Import FAILED: {e}")
        raise ImportError("langchain_mcp_adapters required") from e
    
    # Check cache (with auth token in key)
    print("\n[MCP ADAPTER] Step 2: Checking cache...")
    cache_key = _get_cache_key(worker_tools, auth_token)
    cached = _mcp_tools_cache.get(cache_key)
    print(f"[MCP ADAPTER] Cache key: '{cache_key}'")
    print(f"[MCP ADAPTER] Cache hit: {cached is not None}")
    
    if cached and _is_cache_valid(cached):
        cached_tools = cached.get("tools", [])
        print(f"[MCP ADAPTER] ✅ Using CACHED tools: {len(cached_tools)} tools")
        for t in cached_tools:
            print(f"[MCP ADAPTER]   - {t.name}")
        return cached_tools
    
    print("[MCP ADAPTER] Cache miss or expired - loading fresh")
    
    # Build server configs
    print("\n[MCP ADAPTER] Step 3: Building server configs from registry...")
    server_configs = {}
    invalid_tools = []
    
    for tool_name in worker_tools:
        print(f"\n[MCP ADAPTER] Looking up tool: '{tool_name}'")
        config = mcp_tool_registry.get_mcp_config(tool_name)
        print(f"[MCP ADAPTER]   Registry returned: {config}")
        
        if config is None:
            print(f"[MCP ADAPTER]   ❌ NOT FOUND in registry!")
            invalid_tools.append(tool_name)
            continue
        
        print(f"[MCP ADAPTER]   URL: {config.url}")
        print(f"[MCP ADAPTER]   Transport: {config.transport}")
        
        if not config.url:
            print(f"[MCP ADAPTER]   ❌ URL is empty!")
            invalid_tools.append(tool_name)
            continue
        
        # Build server config with headers if provided
        server_config = {
            "url": config.url,
            "transport": "streamable_http",
        }
        
        # Add headers if provided (for auth token)
        if mcp_headers:
            server_config["headers"] = mcp_headers
            print(f"[MCP ADAPTER]   ✅ Added headers to config: {list(mcp_headers.keys())}")
        
        server_configs[tool_name] = server_config
        print(f"[MCP ADAPTER]   ✅ Added to server_configs")
    
    print(f"\n[MCP ADAPTER] Server configs built:")
    print(f"[MCP ADAPTER]   Valid: {list(server_configs.keys())}")
    print(f"[MCP ADAPTER]   Invalid: {invalid_tools}")
    
    if not server_configs:
        print("[MCP ADAPTER] ❌ NO valid server configs - returning []")
        return []
    
    # Load tools from all servers IN PARALLEL to avoid sequential timeout accumulation
    # This is critical for voice sessions where the client has a 10s connection timeout
    print(f"\n[MCP ADAPTER] Step 4: Loading tools from {len(server_configs)} MCP server(s) IN PARALLEL...")
    
    # Reduced timeout per server (5s instead of 10s) to ensure total time stays reasonable
    # Even if all servers time out, parallel execution means max wait is ~5s, not N*10s
    SERVER_TIMEOUT = 5.0
    
    all_tools: List[BaseTool] = []
    successful_servers: Dict[str, Dict] = {}
    
    async def load_tools_from_server(name: str, cfg: Dict) -> Tuple[str, List[BaseTool], Optional[str]]:
        """
        Load tools from a single MCP server.
        Returns: (server_name, tools_list, error_message or None)
        """
        print(f"[MCP ADAPTER] [{name}] Starting parallel load...")
        try:
            client = MultiServerMCPClient({name: cfg})
            tools = await asyncio.wait_for(
                client.get_tools(),
                timeout=SERVER_TIMEOUT
            )
            
            if tools:
                print(f"[MCP ADAPTER] [{name}] ✅ Loaded {len(tools)} tools")
                return (name, list(tools), None)
            else:
                print(f"[MCP ADAPTER] [{name}] ⚠️ Server returned empty tools list")
                return (name, [], None)
                
        except asyncio.TimeoutError:
            print(f"[MCP ADAPTER] [{name}] ❌ TIMEOUT after {SERVER_TIMEOUT}s - skipping")
            return (name, [], f"Timeout after {SERVER_TIMEOUT}s")
        except Exception as e:
            print(f"[MCP ADAPTER] [{name}] ❌ ERROR: {type(e).__name__}: {e}")
            return (name, [], str(e))
    
    # Create tasks for all servers
    tasks = [
        load_tools_from_server(name, cfg) 
        for name, cfg in server_configs.items()
    ]
    
    # Execute all tasks in parallel
    print(f"[MCP ADAPTER] Executing {len(tasks)} parallel tasks...")
    start_time = datetime.now()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"[MCP ADAPTER] All parallel tasks completed in {elapsed:.2f}s")
    
    # Process results
    failed_servers = []
    for result in results:
        if isinstance(result, Exception):
            # This shouldn't happen since we catch exceptions in load_tools_from_server
            print(f"[MCP ADAPTER] ❌ Unexpected exception in gather: {result}")
            continue
            
        name, tools, error = result
        if error:
            failed_servers.append((name, error))
        elif tools:
            all_tools.extend(tools)
            successful_servers[name] = server_configs[name]
            print(f"[MCP ADAPTER] ✅ Added {len(tools)} tools from '{name}'")
    
    # Log failed servers (but don't fail the overall operation)
    if failed_servers:
        print(f"[MCP ADAPTER] ⚠️ {len(failed_servers)} server(s) failed (continuing without them):")
        for name, error in failed_servers:
            print(f"[MCP ADAPTER]   - {name}: {error}")
    
    # Final summary
    print(f"\n[MCP ADAPTER] {'='*50}")
    print(f"[MCP ADAPTER] FINAL SUMMARY")
    print(f"[MCP ADAPTER] {'='*50}")
    print(f"[MCP ADAPTER] Total tools loaded: {len(all_tools)}")
    print(f"[MCP ADAPTER] Successful servers: {list(successful_servers.keys())}")
    
    if all_tools:
        print(f"[MCP ADAPTER] All tool names:")
        for t in all_tools:
            print(f"[MCP ADAPTER]   - {t.name}")
        
        # Cache results
        _mcp_tools_cache[cache_key] = {
            "tools": all_tools,
            "servers": successful_servers,
            "timestamp": datetime.now().timestamp(),
        }
        print(f"[MCP ADAPTER] ✅ Cached {len(all_tools)} tools")
    else:
        print(f"[MCP ADAPTER] ❌ NO TOOLS LOADED - returning empty list")
    
    print(f"[MCP ADAPTER] {'='*70}\n")
    
    return all_tools


async def get_mcp_tools_for_worker(
    worker_tools: List[str],
    auth_token: Optional[str] = None,
    mcp_headers: Optional[Dict[str, str]] = None,
) -> Tuple[List[BaseTool], Dict[str, Any]]:
    """Get MCP tools with metadata."""
    print(f"[MCP ADAPTER] get_mcp_tools_for_worker({worker_tools})")
    tools = await load_and_convert_tools(worker_tools, auth_token, mcp_headers)
    
    cache_key = _get_cache_key(worker_tools, auth_token)
    cached = _mcp_tools_cache.get(cache_key, {})
    
    metadata = {
        "successful_servers": list(cached.get("servers", {}).keys()),
        "tool_count": len(tools),
        "tool_names": [t.name for t in tools],
    }
    
    print(f"[MCP ADAPTER] Returning {len(tools)} tools, metadata: {metadata}")
    return tools, metadata


def clear_mcp_cache():
    """Clear the MCP tools cache."""
    global _mcp_tools_cache, _mcp_client_cache
    _mcp_tools_cache.clear()
    _mcp_client_cache.clear()
    print("[MCP ADAPTER] 🗑️ Cache cleared")


def get_mcp_cache_stats() -> Dict[str, Any]:
    """Get MCP cache statistics."""
    stats = {
        "cached_tool_sets": len(_mcp_tools_cache),
        "cached_clients": len(_mcp_client_cache),
        "cache_keys": list(_mcp_tools_cache.keys()),
    }
    print(f"[MCP ADAPTER] Cache stats: {stats}")
    return stats


# ─────────────────────────────────────────────────────────────────────────────
# Direct Tool Execution
# ─────────────────────────────────────────────────────────────────────────────


async def execute_mcp_tool(
    tool_name: str,
    server_name: str,
    arguments: Dict[str, Any],
    auth_token: Optional[str] = None,
    mcp_headers: Optional[Dict[str, str]] = None,
) -> Any:
    """Execute an MCP tool directly (for testing)."""
    print(f"\n[MCP ADAPTER] execute_mcp_tool()")
    print(f"[MCP ADAPTER]   tool_name: {tool_name}")
    print(f"[MCP ADAPTER]   server_name: {server_name}")
    print(f"[MCP ADAPTER]   arguments: {arguments}")
    print(f"[MCP ADAPTER]   auth_token: {auth_token[:20] if auth_token else 'None'}...")
    
    from langchain_mcp_adapters.client import MultiServerMCPClient
    
    config = mcp_tool_registry.get_mcp_config(server_name)
    if not config:
        print(f"[MCP ADAPTER] ❌ Server '{server_name}' not found")
        raise ValueError(f"MCP server '{server_name}' not found in registry")
    
    server_config = {
        "url": config.url,
        "transport": "streamable_http",
    }
    
    # Add headers if provided
    if mcp_headers:
        server_config["headers"] = mcp_headers
    
    server_configs = {server_name: server_config}
    
    print(f"[MCP ADAPTER] Creating client...")
    client = MultiServerMCPClient(server_configs)
    
    print(f"[MCP ADAPTER] Getting tools...")
    tools = await client.get_tools()
    print(f"[MCP ADAPTER] Got {len(tools)} tools")
    
    tool = None
    for t in tools:
        if t.name == tool_name:
            tool = t
            break
    
    if not tool:
        available = [t.name for t in tools]
        print(f"[MCP ADAPTER] ❌ Tool not found. Available: {available}")
        raise ValueError(f"Tool '{tool_name}' not found. Available: {available}")
    
    print(f"[MCP ADAPTER] Invoking tool...")
    result = await tool.ainvoke(arguments)
    print(f"[MCP ADAPTER] ✅ Result: {result}")
    return result