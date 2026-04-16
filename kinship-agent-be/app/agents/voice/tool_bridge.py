"""
Kinship Agent - Voice Tool Bridge

Bridges Gemini Live function calls to the existing MCP tool infrastructure.
Converts between Gemini's function calling format and MCP tool execution.
"""

import asyncio
import logging
import time
from typing import Dict, Any, List, Optional, TYPE_CHECKING

from app.agents.mcp.langchain_adapter import load_and_convert_tools
from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ToolBridge:
    """
    Bridges Gemini Live function calls to MCP tools.
    
    Responsibilities:
    - Convert worker tool definitions to Gemini function declarations
    - Execute MCP tools when Gemini requests function calls
    - Handle tool errors gracefully
    
    Usage:
        bridge = ToolBridge(worker_tools=["bluesky", "solana"])
        await bridge.initialize(db_session)
        
        # Get function declarations for Gemini setup
        declarations = bridge.get_function_declarations()
        
        # Execute function call from Gemini
        result = await bridge.execute_function("post_to_bluesky", {"text": "Hello"})
    """
    
    def __init__(
        self,
        worker_tools: List[str],
        worker_id: Optional[str] = None,
        auth_token: Optional[str] = None,
        mcp_headers: Optional[Dict[str, str]] = None,
    ):
        """
        Initialize tool bridge.
        
        Args:
            worker_tools: List of tool names (e.g., ["bluesky", "solana"])
            worker_id: Worker agent ID for logging
            auth_token: Auth token for MCP tool calls
            mcp_headers: Additional headers for MCP calls
        """
        self.worker_tools = worker_tools
        self.worker_id = worker_id
        self.auth_token = auth_token
        self.mcp_headers = mcp_headers or {}
        
        self._initialized = False
        self._langchain_tools: List[Any] = []
        self._tool_map: Dict[str, Any] = {}
        
    async def initialize(self, db_session: Optional["AsyncSession"] = None) -> bool:
        """
        Initialize the tool bridge by loading MCP tools.
        
        Args:
            db_session: Database session for credential lookup (not used currently)
            
        Returns:
            True if initialized successfully
        """
        if self._initialized:
            return True
        
        if not self.worker_tools:
            logger.info("No tools to load for voice session")
            self._initialized = True
            return True
        
        try:
            logger.info(f"Loading tools for voice session: {self.worker_tools}")
            logger.info(f"  Auth token: {'YES' if self.auth_token else 'NO'}")
            logger.info(f"  MCP headers: {list(self.mcp_headers.keys()) if self.mcp_headers else 'None'}")
            
            # Load tools from MCP servers
            self._langchain_tools = await load_and_convert_tools(
                worker_tools=self.worker_tools,
                auth_token=self.auth_token,
                mcp_headers=self.mcp_headers,
            )
            
            # Build tool lookup map
            for tool in self._langchain_tools:
                self._tool_map[tool.name] = tool
            
            logger.info(f"Loaded {len(self._langchain_tools)} tools: {list(self._tool_map.keys())}")
            self._initialized = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize tool bridge: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get Gemini-compatible function declarations for all loaded tools.
        
        Returns:
            List of function declarations for Gemini setup
        """
        if not self._initialized:
            logger.warning("Tool bridge not initialized, returning empty declarations")
            return []
        
        declarations = []
        
        for tool in self._langchain_tools:
            declaration = self._convert_tool_to_declaration(tool)
            if declaration:
                declarations.append(declaration)
        
        return declarations
    
    def _convert_tool_to_declaration(self, tool: Any) -> Optional[Dict[str, Any]]:
        """
        Convert a LangChain tool to Gemini function declaration.
        
        Args:
            tool: LangChain tool instance
            
        Returns:
            Gemini function declaration dict
        """
        try:
            # Get tool schema
            name = tool.name
            description = tool.description or f"Tool: {name}"
            
            # Get input schema - handle both Pydantic models and dicts
            properties = {}
            required = []
            
            if hasattr(tool, "args_schema") and tool.args_schema:
                args_schema = tool.args_schema
                
                # Check if it's a Pydantic model class
                if hasattr(args_schema, "schema") and callable(args_schema.schema):
                    schema = args_schema.schema()
                    properties = schema.get("properties", {})
                    required = schema.get("required", [])
                # Check if it's already a dict (JSON schema)
                elif isinstance(args_schema, dict):
                    properties = args_schema.get("properties", {})
                    required = args_schema.get("required", [])
                # Check if it has model_json_schema (Pydantic v2)
                elif hasattr(args_schema, "model_json_schema"):
                    schema = args_schema.model_json_schema()
                    properties = schema.get("properties", {})
                    required = schema.get("required", [])
            
            # Convert to Gemini format
            parameters = {
                "type": "object",
                "properties": {},
                "required": required,
            }
            
            for prop_name, prop_def in properties.items():
                param_type = prop_def.get("type", "string")
                param_desc = prop_def.get("description", "")
                
                # Map JSON Schema types to Gemini types
                gemini_type = self._map_type_to_gemini(param_type)
                
                parameters["properties"][prop_name] = {
                    "type": gemini_type,
                    "description": param_desc,
                }
            
            logger.info(f"Converted tool '{name}' with {len(properties)} parameters")
            
            return {
                "name": name,
                "description": description,
                "parameters": parameters,
            }
            
        except Exception as e:
            logger.error(f"Error converting tool {getattr(tool, 'name', 'unknown')}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _map_type_to_gemini(self, json_type: str) -> str:
        """Map JSON Schema type to Gemini type."""
        type_map = {
            "string": "STRING",
            "number": "NUMBER",
            "integer": "INTEGER",
            "boolean": "BOOLEAN",
            "array": "ARRAY",
            "object": "OBJECT",
        }
        return type_map.get(json_type, "STRING")
    
    async def execute_function(
        self,
        function_name: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a function call from Gemini.
        
        Args:
            function_name: Name of the function to call
            arguments: Function arguments
            
        Returns:
            Result dict with success/error information
        """
        if not self._initialized:
            return {"error": "Tool bridge not initialized"}
        
        tool = self._tool_map.get(function_name)
        if not tool:
            logger.warning(f"Unknown function: {function_name}")
            return {"error": f"Unknown function: {function_name}"}
        
        start_time = time.time()
        
        try:
            logger.info(f"Executing function: {function_name}({arguments})")
            
            # Execute the tool
            result = await tool.ainvoke(arguments)
            
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"Function {function_name} completed in {duration_ms}ms")
            
            return {
                "success": True,
                "result": result,
                "duration_ms": duration_ms,
            }
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Function {function_name} failed: {e}")
            
            return {
                "success": False,
                "error": str(e),
                "duration_ms": duration_ms,
            }
    
    def get_tool_names(self) -> List[str]:
        """Get list of available tool names."""
        return list(self._tool_map.keys())
    
    def has_tools(self) -> bool:
        """Check if any tools are loaded."""
        return len(self._tool_map) > 0


def build_gemini_tools_config(declarations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build Gemini tools configuration from function declarations.
    
    Args:
        declarations: List of function declarations
        
    Returns:
        Tools config for Gemini setup message
    """
    if not declarations:
        return []
    
    return [
        {
            "function_declarations": declarations
        }
    ]