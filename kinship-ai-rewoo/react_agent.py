"""
OPTIMIZED React Agent - Parallel MCP Server Connections
"""

from typing import Dict, Any, List, Optional, Tuple, TypedDict, Annotated, Sequence
import logging
from datetime import datetime
import asyncio
from collections import OrderedDict

from fastapi import HTTPException
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent, ToolNode
from langchain_core.prompts import ChatPromptTemplate
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage, AIMessageChunk
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from config import MCP_SERVERS
from models import SimpleChatMessage, QueryRequest, ChatMessage
from pricing.usage import CalculateTokenUsage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, END

load_dotenv()
logger = logging.getLogger(__name__)


# ==================== LANGGRAPH STATE DEFINITION ====================

class AgentState(TypedDict):
    """State for the LangGraph ReAct agent"""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    # Add custom state fields as needed
    tool_calls_made: List[str]

# ==================== CACHING LAYER ====================

class ServerHealthCache:
    """Cache MCP server health status to avoid repeated connection tests"""
    def __init__(self, ttl_seconds: int = 300):
        self.cache: Dict[str, Tuple[bool, List, float]] = {}
        self.ttl = ttl_seconds
    
    def get(self, server_name: str) -> Optional[Tuple[bool, List]]:
        if server_name in self.cache:
            is_healthy, tools, timestamp = self.cache[server_name]
            if datetime.now().timestamp() - timestamp < self.ttl:
                return is_healthy, tools
            else:
                del self.cache[server_name]
        return None
    
    def set(self, server_name: str, is_healthy: bool, tools: List):
        self.cache[server_name] = (is_healthy, tools, datetime.now().timestamp())
    
    def clear(self):
        self.cache.clear()

# Global caches
_server_health_cache = ServerHealthCache(ttl_seconds=300)  # 5 minutes
_agent_cache: Dict[str, Dict[str, Any]] = {}


# ==================== OPTIMIZED SERVER CONNECTION ====================

async def test_server_connection_with_timeout(
    server_name: str,
    config: dict,
    timeout: float = 3.0
) -> Tuple[bool, List]:
    """
    Test MCP server connection with timeout protection
    
    Args:
        server_name: Name of the server
        config: Server configuration
        timeout: Maximum time to wait for connection (seconds)
    
    Returns:
        Tuple of (success, tools_list)
    """
    # Check cache first
    cached = _server_health_cache.get(server_name)
    if cached is not None:
        logger.info(f"✅ {server_name} (cached): {len(cached[1])} tools")
        return cached
    
    try:
        # Use asyncio.wait_for to enforce timeout
        async def _connect():
            client = MultiServerMCPClient({server_name: config})
            tools = await client.get_tools()
            return tools
        
        tools = await asyncio.wait_for(_connect(), timeout=timeout)
        
        if tools:
            logger.info(f"✅ {server_name} connected: {len(tools)} tools")
            _server_health_cache.set(server_name, True, tools)
            return True, tools
        else:
            logger.warning(f"⚠️ {server_name} returned no tools")
            _server_health_cache.set(server_name, False, [])
            return False, []
            
    except asyncio.TimeoutError:
        logger.error(f"❌ {server_name} timeout after {timeout}s")
        _server_health_cache.set(server_name, False, [])
        return False, []
    except Exception as e:
        logger.error(f"❌ {server_name} failed: {str(e)[:100]}")
        _server_health_cache.set(server_name, False, [])
        return False, []


async def test_all_servers_parallel(
    servers: Dict[str, dict],
    timeout_per_server: float = 3.0
) -> Dict[str, Tuple[bool, List]]:
    """
    Test all MCP servers in parallel for fast initialization
    
    Args:
        servers: Dictionary of server configs
        timeout_per_server: Timeout for each server connection
    
    Returns:
        Dictionary mapping server_name to (success, tools)
    """
    logger.info(f"🔄 Testing {len(servers)} servers in parallel...")
    
    # Create tasks for all servers
    tasks = {
        server_name: test_server_connection_with_timeout(
            server_name, config, timeout_per_server
        )
        for server_name, config in servers.items()
    }
    
    # Wait for all tasks with overall timeout
    results = {}
    try:
        # Use asyncio.gather to run all connections in parallel
        completed = await asyncio.gather(
            *tasks.values(),
            return_exceptions=True
        )
        
        # Map results back to server names
        for server_name, result in zip(tasks.keys(), completed):
            if isinstance(result, Exception):
                logger.error(f"❌ {server_name} exception: {result}")
                results[server_name] = (False, [])
            else:
                results[server_name] = result
                
    except Exception as e:
        logger.error(f"❌ Parallel server testing failed: {e}")
        # Return empty results for all servers
        results = {name: (False, []) for name in servers.keys()}
    
    successful = sum(1 for success, _ in results.values() if success)
    logger.info(f"✅ {successful}/{len(servers)} servers connected")
    
    return results

# ==================== LANGGRAPH NODES ====================

def create_agent_node(llm_with_tools, system_prompt: str):
    """Create the agent decision node"""
    def agent_node(state: AgentState) -> Dict[str, Any]:
        """Agent decides next action using LLM"""
        messages = state["messages"]

        # Add system prompt if not present
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=system_prompt)] + list(messages)

        # Call LLM with tools
        response = llm_with_tools.invoke(messages)
        logger.info(f"++++++++++++++++++++++++{response}+++++++++++++++++")

        # Track tool calls
        tool_calls = state.get("tool_calls_made", [])
        if hasattr(response, 'tool_calls') and response.tool_calls:
            for tc in response.tool_calls:
                tool_calls.append(tc.get("name", "unknown"))

        return {
            "messages": [response],
            "tool_calls_made": tool_calls
        }

    return agent_node

# ==================== LANGGRAPH BUILDER ====================

def build_react_graph(
    tools: List,
    llm,
    system_prompt: str,
    enable_checkpointing: bool = True
):
    """
    Build custom LangGraph ReAct agent

    Advantages over prebuilt:
    - Custom state tracking (iterations, tool usage)
    - Better error handling
    - Iteration limits
    - Checkpointing support
    - Easy to add human-in-the-loop
    """
    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(tools)

    # Create graph
    workflow = StateGraph(AgentState)

    # Add nodes
    agent_node = create_agent_node(llm_with_tools, system_prompt)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(tools))

    # Set entry point
    workflow.set_entry_point("agent")

    # Add conditional edges
    # should_continue = create_should_continue(max_iterations)
    # workflow.add_conditional_edges(
    #     "agent",
    #     should_continue,
    #     {
    #         "continue": "tools",
    #         "end": END
    #     }
    # )

    # Tools always go back to agent
    workflow.add_edge("tools", "agent")

    # Compile with optional checkpointing
    if enable_checkpointing:
        memory = MemorySaver()
        return workflow.compile(checkpointer=memory)
    else:
        return workflow.compile()

# ==================== OPTIMIZED AGENT INITIALIZATION ====================

async def initialize_react_agent(
    agentId: Optional[str] = None,
    session_token: Optional[str] = None,
    wallet: Optional[str] = None,
    aiModel: Optional[str] = None,
    enable_checkpointing: bool = True
):
    """
    Initialize custom LangGraph ReAct agent
    """
    global _agent_cache
    cache_key = session_token or "default"

    if (cache_key in _agent_cache 
        and _agent_cache[cache_key].get("agent") is not None 
        and _agent_cache[cache_key].get("aiModel") == aiModel):
        logger.info(f"♻️ Using cached agent for session: {cache_key} (model: {aiModel})")
        return _agent_cache[cache_key]["agent"]

    try:
        logger.info(f"🔧 Initializing LangGraph ReAct agent for session: {cache_key}")
        start_time = datetime.now()

        # Prepare server configs
        server_configs = {}
        for server_name, config in MCP_SERVERS.items():
            cfg = config.copy()
            if session_token:
                cfg["headers"] = {"Authorization": session_token}
            server_configs[server_name] = cfg

        # Parallel connection testing
        server_results = await test_all_servers_parallel(
            server_configs,
            timeout_per_server=3.0
        )

        # Filter successful servers
        successful_servers = {}
        all_tools = []
        
        for server_name, (success, tools) in server_results.items():
            if success and tools:
                successful_servers[server_name] = server_configs[server_name]
                all_tools.extend(tools)

        if not successful_servers:
            raise ValueError("No MCP servers available. All connections failed.")

        # Create MCP client
        logger.info(f"🔗 Creating MCP client with {len(successful_servers)} servers...")
        mcp_client = MultiServerMCPClient(successful_servers)

        # Build system prompt
        tool_info = "\n".join(f"- **{t.name}**: {t.description}" for t in all_tools)
        
        system_prompt = f"""You are a helpful research assistant with access to these tools:
{tool_info}

For each question, think step-by-step. Only use a tool if it helps, formatted as:
Thought: ...
Action: <tool_name>
Action Input: <input>
Observation: <output from tool>

Finally, give the answer in Markdown format."""

        # Create LLM
        model = create_llm(
            aiModel,
            temperature=1,
            streaming=True,
            callbacks=[CalculateTokenUsage(agentId=agentId or "default", wallet=wallet)]
        )

        # Build LangGraph ReAct agent
        logger.info(f"🤖 Building LangGraph agent with {len(all_tools)} tools...")
        react_agent = build_react_graph(
            tools=all_tools,
            llm=model,
            system_prompt=system_prompt,
            enable_checkpointing=enable_checkpointing
        )

        # Cache the agent
        _agent_cache[cache_key] = {
            "client": mcp_client,
            "agent": react_agent,
            "tools": all_tools,
            "aiModel": aiModel,
            "created_at": datetime.now()
        }

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"✅ LangGraph agent initialized in {elapsed:.2f}s with "
            f"{len(all_tools)} tools from {len(successful_servers)} servers"
        )
        
        return react_agent

    except Exception as e:
        logger.error(f"❌ Error initializing LangGraph agent: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize LangGraph agent: {str(e)}"
        )


# ==================== OPTIMIZED STREAMING ====================


def create_llm(model_name: str, **kwargs):
    if model_name.startswith("gpt-"):
        return ChatOpenAI(model=model_name, **kwargs)
    elif model_name.startswith("gemini-"):
        return ChatGoogleGenerativeAI(model=model_name, **kwargs)
    else:
        raise ValueError(f"Unsupported model provider for: {model_name}")

async def run_agent_streaming(
    messages: List[BaseMessage],
    agentId: Optional[str] = None,
    session_token: Optional[str] = None,
    wallet: Optional[str] = None,
    aiModel: Optional[str] = None,
    namespaces: Optional[List[str]] = None
):
    """
    OPTIMIZED: Stream agent responses with proper error handling
    """
    try:
        # Get cached agent (fast if already initialized)
        agent = await initialize_react_agent(
            agentId=agentId,
            session_token=session_token,
            wallet=wallet,
            aiModel=aiModel
        )
        
        # Prepare initial state
        initial_state = {
            "messages": messages,
            "tool_calls_made": [],
        }

        # Configure for user and agent based checkpointing
        config = {"configurable": {"thread_id": wallet + agentId}}
        
        # Use astream instead - simpler and avoids duplicates
        async for chunk in agent.astream(initial_state, config=config, stream_mode="messages"):
            # chunk is a tuple of (message, metadata)
            if isinstance(chunk, tuple):
                message, metadata = chunk
            else:
                message = chunk
            
            # Only yield AI messages with content
            if hasattr(message, 'content') and message.content:
                # Check if it's not a tool call
                if not (hasattr(message, 'tool_calls') and message.tool_calls):
                    yield AIMessageChunk(content=message.content)
        # async for event in agent.astream_events(
        #     initial_state, config=config, stream_mode="messages",version="v2"
        # ):
        #     # Handle LLM token streaming events
        #     if event["event"] == "on_chat_model_stream":
        #         chunk = event["data"].get("chunk")
        #         if chunk and hasattr(chunk, 'content') and chunk.content:
        #             yield chunk
                
    except Exception as e:
        logger.error(f"❌ Error in streaming agent: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Streaming agent error: {str(e)}"
        )


# ==================== HELPER FUNCTIONS ====================

def process_frontend_chat_history(
    chat_history: List[SimpleChatMessage]
) -> List[Dict[str, str]]:
    """Process frontend chat history format into LLM-compatible messages"""
    if not chat_history:
        return []
    
    try:
        messages = []
        sorted_messages = sorted(chat_history, key=lambda x: x.timestamp)
        
        for msg in sorted_messages:
            content = msg.content.strip() if msg.content else ""
            if content and content != '""':
                messages.append({
                    "role": msg.role,
                    "content": content
                })
        
        logger.info(f"💬 Processed {len(messages)} messages from chat history")
        return messages
        
    except Exception as e:
        logger.error(f"❌ Error processing chat history: {str(e)}")
        return []


def construct_messages(request: QueryRequest) -> List[BaseMessage]:
    """Construct message list for ReAct agent"""
    messages = []
    
    # System message
    custom_prompt = request.instructions or request.system_prompt
    
    # Append namespace info
    if request.namespaces:
        namespace_info = (
            f"\n\nAvailable namespaces for search: {', '.join(request.namespaces)}\n"
            f"IMPORTANT: When using the unstructured_db_search tool, "
            f"pass these namespaces as the 'namespaces' parameter: {request.namespaces}"
        )
        custom_prompt = (custom_prompt or "") + namespace_info
    
    if custom_prompt:
        messages.append(SystemMessage(content=custom_prompt))
    
    # Chat history
    chat_history = request.chatHistory or request.userHistory
    if chat_history:
        for chat_msg in chat_history:
            if chat_msg.role == "user":
                messages.append(HumanMessage(content=chat_msg.content))
            elif chat_msg.role == "assistant":
                messages.append(AIMessage(content=chat_msg.content))
    
    # Current query
    messages.append(HumanMessage(content=request.query))
    
    return messages


def get_available_tools() -> List[Any]:
    """Get list of available tools from cache"""
    for cache_data in _agent_cache.values():
        if "tools" in cache_data:
            return cache_data["tools"]
    return []


def is_agent_ready() -> bool:
    """Check if any agent is cached and ready"""
    return len(_agent_cache) > 0 and any(
        cache.get("agent") is not None for cache in _agent_cache.values()
    )


async def health_check_servers() -> Dict[str, str]:
    """
    Check health of all MCP servers (uses parallel testing)
    """
    results = await test_all_servers_parallel(MCP_SERVERS, timeout_per_server=2.0)
    
    return {
        server_name: "healthy" if success else "unhealthy"
        for server_name, (success, _) in results.items()
    }


def clear_agent_cache():
    """Clear all cached agents (useful for testing/debugging)"""
    global _agent_cache
    _agent_cache.clear()
    _server_health_cache.clear()
    logger.info("🗑️ Cleared agent cache")
