"""
FastAPI Application with LangGraph Dynamic Workflow Agent

Complete integration with:
1. History Management - MongoDB persistence
2. State Management - LangGraph state with checkpoints
3. Dynamic Goal Nodes - Checkpoints as workflow nodes
4. LangSmith Integration - Full observability

"""

import io
import os
import traceback
import logging
import json
import aiohttp
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional, List
import re
import asyncio
import openai

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Request, WebSocket, WebSocketDisconnect, WebSocketException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from pipeline.pipeline import VoicePipeline
from pipeline.stt import GroqSTT
from pipeline.tts import OpenAITTS
from pipeline.typing import PipelineConfig
from pipeline.voice_agent import VoiceAgent
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# Import from new LangGraph workflow
from langgraph_workflow import (
    run_agent,
    run_agent_streaming,
    initialize_react_agent,
    get_available_tools,
    is_agent_ready,
    health_check_servers,
    construct_messages,
    on_goals_changed,
    history_manager,
    goal_manager,
    clear_agent_cache
)

from models import (
    QueryRequest, 
    HealthResponse, 
    SessionAuthResponse, 
    AuthenticatedUser,
    ChatMessage
)
from config import API_TITLE, API_DESCRIPTION, API_VERSION, API_HOST, API_PORT

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")

if not MONGO_URI or not MONGO_DB_NAME:
    raise ValueError("MONGO_URI and MONGO_DB_NAME environment variables must be set")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]

logger.info(f"✅ MongoDB connected: {MONGO_DB_NAME}")


# ==================== PYDANTIC MODELS ====================

class SaveChatRequest(BaseModel):
    chatId: str
    agentID: str
    namespaces: Optional[List[str]] = None
    systemPrompt: str
    userContent: str
    botContent: str


class SaveChatResponse(BaseModel):
    message: str
    user_message_id: str
    bot_message_id: str


class GoalsChangedRequest(BaseModel):
    """Request from Go backend when goals change."""
    user_id: str
    agent_id: str


class GoalsChangedResponse(BaseModel):
    status: str
    message: str


# ==================== LIFESPAN ====================

@asynccontextmanager
async def app_lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    logger.info("🚀 Starting LangGraph Dynamic Workflow API...")
    
    try:
        # Pre-initialize the workflow graph
        await initialize_react_agent()
        logger.info("✅ Workflow graph initialized")
    except Exception as e:
        logger.warning(f"⚠️ Startup warning: {e}")
        logger.info("💡 Workflow will be initialized on first request")
    
    yield
    
    logger.info("🛑 Shutting down API...")
    clear_agent_cache()


# ==================== FASTAPI APP ====================

app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=app_lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ==================== AUTHENTICATION ====================

EXTERNAL_AUTH_URL = os.getenv("EXTERNAL_AUTH_URL", "https://api.kinship.codes/is-auth")

async def validate_session_token(session_token: str) -> Optional[AuthenticatedUser]:
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {session_token}",
                "Content-Type": "application/json"
            }
            async with session.get(EXTERNAL_AUTH_URL, headers=headers) as response:
 
                if response.status != 200:
                    return None
 
                raw = await response.json()
                
                # Extract "data" field
                payload = raw.get("data", raw)
 
                auth_response = SessionAuthResponse(**payload)
 
                if auth_response.isAuth and auth_response.user:
                    return AuthenticatedUser(
                        user=auth_response.user,
                        session_token=session_token
                    )
 
                return None
 
    except Exception as e:
        logger.error(f"❌ Session validation error: {e}")
        return None
 


def get_authenticated_user(request: Request) -> Optional[AuthenticatedUser]:
    """Get authenticated user from request state."""
    return getattr(request.state, "authenticated_user", None)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Authentication middleware."""
    # Skip auth for public endpoints
    public_paths = ["/health", "/", "/docs", "/redoc", "/openapi.json", "/internal/goals-changed"]
    
    if request.url.path in public_paths or request.method == "OPTIONS":
        return await call_next(request)
    
    # Get auth header
    auth_header = request.headers.get("authorization", "")
    
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
        authenticated_user = await validate_session_token(session_token)
        
        if authenticated_user:
            request.state.authenticated_user = authenticated_user
    
    return await call_next(request)


# ==================== STREAMING RESPONSE ====================

async def stream_workflow_response(
    request: QueryRequest,
    session_token: str,
    bot_id:str,
    user_id: str,
    agent_id: str,
    wallet: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """
    Stream the workflow agent response using SSE.
    
    Args:
        request: Query request
        session_token: Auth token
        user_id: User identifier
        agent_id: Agent identifier (unified naming)
        wallet: User's wallet address
    
    This function:
    1. Initializes the stream
    2. Runs the LangGraph workflow
    3. Streams tokens as SSE events
    4. Handles errors gracefully
    """
    try:
        # Send connection confirmation
        yield f"event: connected\ndata: {json.dumps({'type': 'connected', 'message': 'Stream initialized'})}\n\n"
        
        # Validate request
        if not request.query or not request.query.strip():
            yield f"event: error\ndata: {json.dumps({'error': 'Query is required', 'type': 'error'})}\n\n"
            return
        
        if not request.agentId:
            yield f"event: error\ndata: {json.dumps({'error': 'agentId is required', 'type': 'error'})}\n\n"
            return
        
        # Send processing status
        yield f"event: processing\ndata: {json.dumps({'type': 'processing', 'message': 'Processing...'})}\n\n"
        
        # Get chat history from request
        chat_history = request.chatHistory or request.userHistory
        
        # Stream the response
        full_response = ""
        has_content = False
        
        async for chunk in run_agent_streaming(
            request=request,
            user_id=user_id,
            agent_id=agent_id,
            bot_id=bot_id,
            session_token=session_token,
            wallet=wallet,
            chat_history=chat_history
        ):
            if hasattr(chunk, 'content') and chunk.content:
                content = str(chunk.content)
                full_response += content
                has_content = True
                
                # Send chunk as SSE
                chunk_data = {
                    'type': 'chunk',
                    'content': content
                }
                yield f"event: chunk\ndata: {json.dumps(chunk_data)}\n\n"
        
        # Send completion event
        if has_content:
            complete_data = {
                'type': 'complete',
                'full_response': full_response
            }
            yield f"event: complete\ndata: {json.dumps(complete_data)}\n\n"
        else:
            yield f"event: complete\ndata: {json.dumps({'type': 'complete', 'full_response': 'No response generated'})}\n\n"
            
    except Exception as e:
        logger.error(f"❌ Streaming error: {e}")
        traceback.print_exc()
        yield f"event: error\ndata: {json.dumps({'error': str(e), 'type': 'error'})}\n\n"




@app.websocket("/ws")
async def websocket_handler(
    websocket: WebSocket,
    token: str = Query(..., description="Authentication token"),
    agent_id: str = Query(..., description="Agent ID"),
    bot_id: str = Query(..., description="Bot ID"),
    ai_model: str = Query(..., description="AI Model"),
):
    pipeline = None
    connection_active = False

    try:
        # Accept connection with extended timeouts
        await websocket.accept()
        connection_active = True
        logger.info(f"WebSocket connection accepted for user session")

        # Validate session token
        authenticated_user = await validate_session_token(token)
        if not authenticated_user:
            logger.warning("Authentication failed")
            await websocket.close(code=1008, reason="User not authenticated")
            connection_active = False
            return

        logger.info(f"User authenticated: {authenticated_user.user.id}")

        # Create processing pipeline with the received parameters
        pipeline = VoicePipeline(
            websocket=websocket,
            config=PipelineConfig(),
            stt=GroqSTT(),
            tts=OpenAITTS(),
            agent=VoiceAgent(model="openai/gpt-oss-120b", provider="groq"),
            session_token=token,
            agent_id=agent_id,
            bot_id=bot_id,
            user_id=authenticated_user.user.id,
            wallet=getattr(authenticated_user.user, "wallet", ""),
            aiModel=ai_model,
        )

        logger.info(f"Pipeline created, starting...")

        # Run pipeline - it will run until shutdown_event is set
        await pipeline.start()

        logger.info(f"Pipeline finished normally")

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
        connection_active = False

    except WebSocketException as e:
        logger.error(f"WebSocket Exception: {repr(e)}")
        connection_active = False

    except Exception as e:
        logger.error(f"Unexpected Exception in WebSocket handler: {repr(e)}")
        import traceback

        traceback.print_exc()

    finally:
        logger.info("WebSocket handler cleanup starting...")

        # Stop pipeline if it exists
        if pipeline:
            try:
                logger.info("Stopping pipeline...")
                await asyncio.wait_for(pipeline.stop(), timeout=5.0)
                logger.info("Pipeline stopped")
            except asyncio.TimeoutError:
                logger.warning("Pipeline stop timed out")
            except Exception as e:
                logger.error(f"Error stopping pipeline: {repr(e)}")

        # Close websocket if still open
        if connection_active:
            try:
                # Check connection state before closing
                if hasattr(websocket, "client_state"):
                    state = websocket.client_state.name
                    if state not in ["DISCONNECTED", "DISCONNECTING"]:
                        await asyncio.wait_for(
                            websocket.close(code=1000, reason="Normal closure"),
                            timeout=2.0,
                        )
                        logger.info("WebSocket closed normally")
            except asyncio.TimeoutError:
                logger.warning("WebSocket close timed out")
            except Exception as e:
                logger.debug(
                    f"Error closing websocket (may already be closed): {repr(e)}"
                )

        # Explicitly delete pipeline reference
        if pipeline:
            del pipeline

        # Force garbage collection
        import gc

        gc.collect()

        logger.info("WebSocket handler cleanup completed")

# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "LangGraph Dynamic Workflow Agent",
        "version": API_VERSION,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Comprehensive health check."""
    try:
        mcp_status = await health_check_servers()
        agent_ready = is_agent_ready()
        
        overall_status = "healthy" if all(
            status == "healthy" for status in mcp_status.values()
        ) else "degraded"
        
        return HealthResponse(
            status=overall_status,
            mcp_servers=mcp_status,
            available_tools=len(get_available_tools()),
            agent_ready=agent_ready,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            mcp_servers={},
            available_tools=0,
            agent_ready=False,
            timestamp=datetime.now().isoformat()
        )


@app.post("/react/stream")
async def stream_react_query(request: Request, query: QueryRequest):
    """
    Stream agent response using Server-Sent Events.
    
    This is the main endpoint for chat interactions.
    """
    # Check authentication
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    logger.info(f"✅ Authenticated user: {authenticated_user.user.email}")
    
    # Extract session token
    auth_header = request.headers.get("authorization", "")
    session_token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header
    
    # Get user info
    user_id = authenticated_user.user.id
    agent_id = query.agentId
    wallet = getattr(authenticated_user.user, 'wallet', None)
    bot_id = query.bot_id
    
    logger.info(f"📝 Query: {query.query[:100]}...")
    logger.info(f"🎯 Agent ID: {agent_id}")
    logger.info(f"📁 Namespaces: {query.namespaces}")
    
    # Return streaming response
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*"
    }
    
    return StreamingResponse(
        stream_workflow_response(
            request=query,
            session_token=session_token,
            user_id=user_id,
            agent_id=agent_id,
            wallet=wallet,
            bot_id=bot_id
        ),
        media_type="text/event-stream",
        headers=headers
    )


@app.post("/react/query")
async def query_react_agent(request: Request, query: QueryRequest):
    """
    Non-streaming query endpoint.
    
    Returns complete response in one JSON object.
    """
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    auth_header = request.headers.get("authorization", "")
    session_token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header
    
    user_id = authenticated_user.user.id
    agent_id = query.agentId
    wallet = getattr(authenticated_user.user, 'wallet', None)
    
    try:
        result = await run_agent(
            request=query,
            user_id=user_id,
            agent_id=agent_id,
            session_token=session_token,
            wallet=wallet,
            chat_history=query.chatHistory or query.userHistory
        )
        
        return {
            "success": True,
            "namespaces": query.namespaces,
            "query": query.query,
            "result": result.get("response", ""),
            "execution_time_seconds": result.get("execution_time", 0),
            "timestamp": datetime.now().isoformat(),
            "tools_used": result.get("tools_used", []),
            "current_goal": result.get("current_goal"),
            "all_goals_done": result.get("all_goals_done", False),
            "thread_id": result.get("thread_id")
        }
        
    except Exception as e:
        logger.error(f"❌ Query error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-chat", response_model=SaveChatResponse)
async def save_chat(request: Request, save_request: SaveChatRequest):
    """Save chat messages to MongoDB."""
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    try:
        chat_object_id = ObjectId(save_request.chatId)
        agent_object_id = ObjectId(save_request.agentID)
        
        # Find chat document
        chat_doc = db.chats.find_one({"_id": chat_object_id})
        if not chat_doc:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        owner_id = chat_doc.get("owner")
        if not owner_id:
            raise HTTPException(status_code=400, detail="Chat missing owner")
        
        created_at = datetime.now(timezone.utc)
        
        # Create user message
        user_message_id = ObjectId()
        user_message = {
            "_id": user_message_id,
            "content": save_request.userContent,
            "type": "user",
            "created_at": created_at,
            "sender": owner_id,
            "isloading": False,
            "systemprompt": save_request.systemPrompt,
            "namespaces": save_request.namespaces,
            "agentid": agent_object_id,
            "chatid": chat_object_id
        }
        
        # Create bot message
        bot_message_id = ObjectId()
        bot_message = {
            "_id": bot_message_id,
            "content": save_request.botContent,
            "type": "bot",
            "created_at": created_at,
            "sender": agent_object_id,
            "isloading": False,
            "systemprompt": "",
            "namespaces": None,
            "agentid": agent_object_id,
            "chatid": chat_object_id
        }
        
        # Update chat document
        result = db.chats.update_one(
            {"_id": chat_object_id},
            {
                "$push": {"messages": {"$each": [user_message, bot_message]}},
                "$set": {"lastMessage": bot_message}
            }
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to save messages")
        
        logger.info(f"✅ Messages saved to chat {save_request.chatId}")
        
        return SaveChatResponse(
            message="Messages saved successfully",
            user_message_id=str(user_message_id),
            bot_message_id=str(bot_message_id)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error saving chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/internal/goals-changed", response_model=GoalsChangedResponse)
async def goals_changed_webhook(data: GoalsChangedRequest):
    """
    Webhook called by Go backend when goals change.
    
    This invalidates the workflow cache so it rebuilds with new goals.
    """
    try:
        on_goals_changed(data.user_id, data.agent_id)
        
        logger.info(f"🔄 Goals changed webhook: user={data.user_id}, agent={data.agent_id}")
        
        return GoalsChangedResponse(
            status="ok",
            message="Workflow cache invalidated"
        )
        
    except Exception as e:
        logger.error(f"❌ Goals changed webhook error: {e}")
        return GoalsChangedResponse(
            status="error",
            message=str(e)
        )


@app.post("/transcribe")
async def transcribe_audio(request: Request, audio: UploadFile = File(...)):
    """Transcribe audio to text using OpenAI Whisper API."""
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    try:
        audio_data = await audio.read()
        if not audio_data:
            raise HTTPException(status_code=400, detail="No audio data received")
        
        audio_file = io.BytesIO(audio_data)
        audio_file.name = audio.filename or "audio.webm"
        
        transcript = openai.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en"
        )
        
        return {
            "message": "Transcription successful",
            "text": transcript.text,
            "success": True
        }
        
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== GOAL MANAGEMENT ENDPOINTS ====================

@app.get("/goals/{user_id}/{agent_id}")
async def get_user_goals(request: Request, user_id: str, agent_id: str):
    """Get user's pending goals."""
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    goals = goal_manager.get_user_goals(user_id, agent_id)
    
    return {
        "success": True,
        "goals": goals,
        "count": len(goals)
    }


@app.get("/goals/{user_id}/{agent_id}/next")
async def get_next_goal(request: Request, user_id: str, agent_id: str):
    """Get user's next incomplete goal."""
    authenticated_user = get_authenticated_user(request)
    if not authenticated_user:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    goal = goal_manager.get_next_incomplete_goal(user_id, agent_id)
    
    if goal:
        uncollected = goal_manager.get_uncollected_attributes(goal)
        return {
            "success": True,
            "has_goal": True,
            "goal": goal,
            "uncollected_attributes": uncollected
        }
    
    return {
        "success": True,
        "has_goal": False,
        "goal": None
    }


# ==================== ERROR HANDLERS ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions."""
    logger.error(f"❌ HTTP Exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unhandled exceptions."""
    logger.error(f"❌ Unhandled exception: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        }
    )


# ==================== MAIN ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=API_HOST, port=API_PORT, reload=True)
