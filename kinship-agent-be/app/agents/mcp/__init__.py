"""
Kinship Agent - MCP Tool Integration

Provides integration with MCP (Model Context Protocol) servers:
- Registry: Maps tool names to MCP server configurations
- LangChain Adapter: Loads MCP tools using langchain_mcp_adapters

Note: Uses langchain_mcp_adapters.MultiServerMCPClient for MCP protocol handling.
"""

from app.agents.mcp.registry import (
    MCPToolRegistry,
    mcp_tool_registry,
    ToolValidationResult,
    WorkerToolsValidation,
)

from app.agents.mcp.langchain_adapter import (
    load_and_convert_tools,
    get_mcp_tools_for_worker,
    clear_mcp_cache,
    get_mcp_cache_stats,
    execute_mcp_tool,
)

__all__ = [
    # Registry
    "MCPToolRegistry",
    "mcp_tool_registry",
    "ToolValidationResult",
    "WorkerToolsValidation",
    
    # LangChain Adapter (main entry points)
    "load_and_convert_tools",
    "get_mcp_tools_for_worker",
    "clear_mcp_cache",
    "get_mcp_cache_stats",
    "execute_mcp_tool",
]
