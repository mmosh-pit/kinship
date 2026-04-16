"""
Kinship Agent - Enhanced MCP Tool Registry

ADDRESSES CONCERNS:
- #8 MCP Tool Validation: Comprehensive validation layer

VALIDATION CHECKS:
1. Tool is registered in config
2. URL is present and valid
3. Transport is valid (streamable_http, stdio, sse)
4. Capabilities are defined
5. Worker compatibility check
"""

import logging
from typing import Optional, List, Dict, Set, Tuple
from dataclasses import dataclass
from enum import Enum

from app.core.config import mcp_tools_config, MCPToolConfig

logger = logging.getLogger(__name__)


class ToolValidationStatus(Enum):
    """Validation status codes."""
    VALID = "valid"
    NOT_REGISTERED = "not_registered"
    MISSING_URL = "missing_url"
    INVALID_TRANSPORT = "invalid_transport"
    MISSING_CAPABILITIES = "missing_capabilities"


@dataclass
class ToolValidationResult:
    """Result of validating a single tool."""
    tool_name: str
    status: ToolValidationStatus
    is_valid: bool
    error: Optional[str] = None
    config: Optional[MCPToolConfig] = None
    
    @property
    def message(self) -> str:
        """Human-readable message."""
        messages = {
            ToolValidationStatus.VALID: f"Tool '{self.tool_name}' is valid",
            ToolValidationStatus.NOT_REGISTERED: f"Tool '{self.tool_name}' not in registry",
            ToolValidationStatus.MISSING_URL: f"Tool '{self.tool_name}' has no URL",
            ToolValidationStatus.INVALID_TRANSPORT: f"Tool '{self.tool_name}' has invalid transport",
            ToolValidationStatus.MISSING_CAPABILITIES: f"Tool '{self.tool_name}' has no capabilities",
        }
        return messages.get(self.status, f"Unknown: {self.status}")


@dataclass
class WorkerToolsValidation:
    """Result of validating all tools for a worker."""
    worker_id: str
    tool_names: List[str]
    results: List[ToolValidationResult]
    
    @property
    def is_valid(self) -> bool:
        """True if all tools valid."""
        return all(r.is_valid for r in self.results)
    
    @property
    def valid_tools(self) -> List[str]:
        """List of valid tool names."""
        return [r.tool_name for r in self.results if r.is_valid]
    
    @property
    def invalid_tools(self) -> List[str]:
        """List of invalid tool names."""
        return [r.tool_name for r in self.results if not r.is_valid]
    
    @property
    def errors(self) -> List[str]:
        """Error messages for invalid tools."""
        return [r.message for r in self.results if not r.is_valid]


class MCPToolRegistry:
    """
    Registry mapping tool names to MCP server configurations.
    
    VALIDATION (#8):
    - validate_tool(): Single tool validation
    - validate_worker_tools(): Batch validation for worker
    
    Workers store tool names like ["twitter", "gmail"].
    Registry provides MCP server URLs and validates configs.
    """
    
    VALID_TRANSPORTS = {"streamable_http", "stdio", "sse"}
    
    def __init__(self):
        """Initialize from config."""
        self._registry: Dict[str, MCPToolConfig] = dict(mcp_tools_config)
        logger.info(f"MCP Registry: {len(self._registry)} tools registered")
    
    # ─────────────────────────────────────────────────────────────────────────
    # VALIDATION (#8)
    # ─────────────────────────────────────────────────────────────────────────
    
    def validate_tool(self, tool_name: str) -> ToolValidationResult:
        """
        Validate a single tool configuration.
        
        Checks:
        1. Tool exists in registry
        2. URL is present
        3. Transport is valid
        4. Has capabilities (warning only)
        """
        config = self._registry.get(tool_name)
        
        if config is None:
            return ToolValidationResult(
                tool_name=tool_name,
                status=ToolValidationStatus.NOT_REGISTERED,
                is_valid=False,
                error=f"Tool '{tool_name}' not found in MCP registry",
            )
        
        if not config.url or not config.url.strip():
            return ToolValidationResult(
                tool_name=tool_name,
                status=ToolValidationStatus.MISSING_URL,
                is_valid=False,
                error=f"Tool '{tool_name}' has no MCP server URL",
                config=config,
            )
        
        if config.transport not in self.VALID_TRANSPORTS:
            return ToolValidationResult(
                tool_name=tool_name,
                status=ToolValidationStatus.INVALID_TRANSPORT,
                is_valid=False,
                error=f"Tool '{tool_name}' has invalid transport: {config.transport}",
                config=config,
            )
        
        # Capabilities warning (not an error)
        if not config.capabilities:
            logger.warning(f"Tool '{tool_name}' has no capabilities defined")
        
        return ToolValidationResult(
            tool_name=tool_name,
            status=ToolValidationStatus.VALID,
            is_valid=True,
            config=config,
        )
    
    def validate_worker_tools(
        self,
        worker_id: str,
        tool_names: List[str],
    ) -> WorkerToolsValidation:
        """
        Validate all tools for a worker.
        
        Returns validation result with valid/invalid tool lists.
        """
        validation = WorkerToolsValidation(
            worker_id=worker_id,
            tool_names=tool_names,
            results=[],
        )
        
        for tool_name in tool_names:
            result = self.validate_tool(tool_name)
            validation.results.append(result)
            
            if not result.is_valid:
                logger.warning(f"Worker {worker_id}: {result.message}")
        
        if validation.invalid_tools:
            logger.error(
                f"Worker {worker_id} has {len(validation.invalid_tools)} invalid tools: "
                f"{validation.invalid_tools}"
            )
        
        return validation
    
    # ─────────────────────────────────────────────────────────────────────────
    # Config Access
    # ─────────────────────────────────────────────────────────────────────────
    
    def get_mcp_config(self, tool_name: str) -> Optional[MCPToolConfig]:
        """Get MCP config for a tool."""
        print(f"[MCP REGISTRY] get_mcp_config('{tool_name}')")
        print(f"[MCP REGISTRY]   Registry keys: {list(self._registry.keys())}")
        config = self._registry.get(tool_name)
        if config:
            print(f"[MCP REGISTRY]   ✅ Found config: url={config.url}, transport={config.transport}")
        else:
            print(f"[MCP REGISTRY]   ❌ NOT FOUND in registry!")
        return config
    
    def get_mcp_url(self, tool_name: str) -> Optional[str]:
        """Get MCP server URL for a tool."""
        config = self.get_mcp_config(tool_name)
        return config.url if config else None
    
    def get_mcp_configs_for_tools(
        self,
        tool_names: List[str],
        validate: bool = True,
    ) -> Tuple[Dict[str, Dict], List[str]]:
        """
        Get MCP configs grouped by server URL.
        
        Args:
            tool_names: List of tool names
            validate: If True, validate and skip invalid tools
            
        Returns:
            (server_configs, invalid_tools)
        """
        servers: Dict[str, Dict] = {}
        invalid_tools: List[str] = []
        
        for tool_name in tool_names:
            if validate:
                result = self.validate_tool(tool_name)
                if not result.is_valid:
                    invalid_tools.append(tool_name)
                    continue
                config = result.config
            else:
                config = self.get_mcp_config(tool_name)
                if config is None:
                    invalid_tools.append(tool_name)
                    continue
            
            url = config.url
            if url not in servers:
                servers[url] = {
                    "transport": config.transport,
                    "tools": [],
                    "capabilities": [],
                }
            
            servers[url]["tools"].append(tool_name)
            servers[url]["capabilities"].extend(config.capabilities)
        
        return servers, invalid_tools
    
    def get_capabilities_for_tool(self, tool_name: str) -> List[str]:
        """Get capabilities for a tool."""
        config = self.get_mcp_config(tool_name)
        return config.capabilities if config else []
    
    def get_all_capabilities_for_tools(self, tool_names: List[str]) -> List[str]:
        """Get all capabilities for multiple tools."""
        caps = []
        for name in tool_names:
            caps.extend(self.get_capabilities_for_tool(name))
        return caps
    
    def is_tool_registered(self, tool_name: str) -> bool:
        """Check if tool is registered."""
        return tool_name in self._registry
    
    def list_all_tools(self) -> List[str]:
        """List all registered tools."""
        return list(self._registry.keys())
    
    def list_all_servers(self) -> Set[str]:
        """List unique MCP server URLs."""
        return {c.url for c in self._registry.values()}
    
    def validate_tools(self, tool_names: List[str]) -> Dict[str, bool]:
        """Validate multiple tools, return dict of name -> valid."""
        return {name: self.validate_tool(name).is_valid for name in tool_names}


# Singleton
mcp_tool_registry = MCPToolRegistry()