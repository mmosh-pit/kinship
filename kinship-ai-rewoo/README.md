# React Agent MCP API

A FastAPI application that exposes a React agent as a REST API using MCP (Model Context Protocol) tools via the official LangChain MCP adapters.

## Features

### 🔐 Session Authentication
- Secure session-based authentication for all protected endpoints  
- Integration with external authentication service (api.kinship.codes)
- Public access to documentation and health checks
- Comprehensive error handling with descriptive messages

### 🆕 Chat History Support
The API supports chat history to maintain context across conversations:
- **Backend-driven-approach**: The chat history is fetched from the MongoDB database on each request.
- **Context-aware**: Maintains conversation context for the LLM

### 🤖 ReACT Agent with MCP Tools
- Intelligent reasoning and acting using LangGraph
- Integration with MCP (Model Context Protocol) tools
- Real-time streaming responses
- Vector database search capabilities
- Handling checkpoints using PostgreSQL

## Project Structure

```
react-mcp-auth/
├── app.py                 # Main FastAPI application with authentication
├── react_agent.py         # React agent implementation with chat history
├── langgraph_workflow.py  # React agent implementation with chat history and checkpoints
├── models.py              # Pydantic models for requests/responses
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
├── Dockerfile          # Container configuration
└── README.md           # This file
```

## Files Overview

### `app.py`
- Main FastAPI application with all API endpoints
- Authentication middleware with API key validation
- HTTP request/response handling
- Application lifecycle management
- Error handling and CORS configuration

### `langgraph_workflow.py`
- React agent initialization and management
- MCP server connection handling
- Query processing logic with chat history and checkpoint support
- Health check functionality
- Tool usage tracking and logging

### `models.py`
- Pydantic models for request/response validation
- API schema definitions
- Chat history message format (`SimpleChatMessage`)
- Query request/response models

### `config.py`
- Configuration settings for MCP servers
- API configuration constants
- Model settings and defaults

## Usage

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Environment Variables
Create a `.env` file with your configuration:
```
# Required: OpenAI API access
OPENAI_API_KEY=your_openai_api_key_here

# Required: Pinecone for vector search
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=your_pinecone_index_name

# Required: Google Generative AI for embeddings
GENAI_API_KEY=your_google_genai_api_key_here


OPENAI_API_KEY=your_openai_api_key_here
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=your_pinecone_index_name
GENAI_API_KEY=your_google_genai_api_key_here
GOOGLE_API_KEY=your_google_genai_api_key_here
VERTEX_PROJECT_ID=your_vertext_project_index
MONGO_DB_NAME=your_mongodb_database_name
MONGO_URI=your_mongodb_connection_url
 
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your_langchain_api_key_here
LANGSMITH_PROJECT=your_langsmith_project_name_here
LANGCHAIN_TRACING_V2=true
 
EXTERNAL_AUTH_URL=mmosh-backend api base url example https://api.kinship.codes/is-auth
CHECKPOINT_POSTGRES_URI=your_postgres_connection_url
DEBUG=true
LOG_LEVEL=INFO
ALLOWED_ORIGINS=*
GROQ_API_KEY=your_groq_api_key_here
```

**Note**: Session authentication uses tokens validated against the external auth service at `https://api.kinship.codes/is-auth`. No additional API keys are required for authentication.

### 3. Run the Application
```bash
# Option 1: Using uvicorn directly
uvicorn app:app --reload --port 8001

# Option 2: Using the app.py file
python app.py
```

### 4. Access the API
- API Documentation: http://localhost:8001/docs
- Health Check: http://localhost:8001/health
- ReACT Endpoint: POST http://localhost:8001/react/query
- Streaming Endpoint: POST http://localhost:8001/react/stream

## Authentication

This API requires session-based authentication for all endpoints except public documentation and health checks. Authentication is implemented using session tokens validated against an external authentication service.

### How Authentication Works

The API uses **Session Token authentication** with the following characteristics:
- All requests (except public endpoints) must include a valid session token
- Session tokens are passed via the `Authorization` header using Bearer token format
- Tokens are validated against the external auth service at `https://api.kinship.codes/is-auth`
- Invalid or missing tokens result in `401 Unauthorized` responses
- Authentication is enforced by middleware before request processing

### Public Endpoints (No Authentication Required)

The following endpoints are publicly accessible for API discovery and monitoring:
- `GET /` - API information and endpoint list
- `GET /health` - Health check and system status
- `GET /docs` - Interactive API documentation (Swagger UI)
- `GET /redoc` - Alternative API documentation (ReDoc)
- `GET /openapi.json` - OpenAPI specification

### How to Obtain Session Tokens

Session tokens are managed by your frontend application and typically:
1. **User Login**: Users authenticate through your frontend login system
2. **Token Storage**: Session tokens are stored in browser localStorage/sessionStorage
3. **Token Usage**: Frontend includes tokens in API requests
4. **Token Validation**: This API validates tokens against the external auth service

**Frontend Integration Example:**
```javascript
// Frontend login process (example)
const loginUser = async (credentials) => {
  const response = await fetch('your-auth-service/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  
  const data = await response.json();
  if (data.token) {
    localStorage.setItem('sessionToken', data.token);
  }
};
```

### Making Authenticated Requests

Include your session token in the `Authorization` header with every request to protected endpoints.

#### Header Format
```
Authorization: Bearer your-session-token-here
```

#### Example Requests

**curl Example:**
```bash
curl -X POST "http://localhost:8001/react/query" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "instructions": "SYSTEM_PROMPT_HERE",
    "agentId": "CHAT_AGENT_KEY",
    "bot_id": "CHAT_AGENT_ID",
    "aiModel": "gpt-5.2",
    "namespaces": ["CHAT_AGENT_KEY", "PUBLIC"],
    "query": "What is Kinship Bot?"
  }'
```

**Python requests Example:**
```python
import requests

# API endpoint
url = "http://localhost:8001/react/query"

# Session / auth token (same as localStorage token in React)
session_token = "your-session-token-here"

# Headers (SSE-compatible)
headers = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
    "Authorization": f"Bearer {session_token}",
}

# Request payload (same as queryData in React)
payload = {
    "instructions": "SYSTEM_PROMPT_HERE",
    "agentId": "CHAT_AGENT_KEY",
    "bot_id": "CHAT_AGENT_ID",
    "aiModel": "gpt-5.2",
    "namespaces": ["CHAT_AGENT_KEY", "PUBLIC"],
    "query": "What is Kinship Bot?",
}

# Make streaming POST request
response = requests.post(
    url,
    headers=headers,
    json=payload,
)

print(response.json())
```

**JavaScript/Fetch Example:**
```javascript
// Get token from localStorage (same as your example)
const sessionToken = localStorage.getItem("sessionToken");

// API endpoint
const url = "http://localhost:8001/react/stream";

// Request payload (same structure as React queryData)
const payload = {
  instructions: "SYSTEM_PROMPT_HERE",
  agentId: "CHAT_AGENT_KEY",
  bot_id: "CHAT_AGENT_ID",
  aiModel: "gpt-5.2",
  namespaces: ["CHAT_AGENT_KEY", "PUBLIC"],
  query: "USER_MESSAGE_CONTENT",
};

// Make streaming request
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
    "Authorization": `Bearer ${sessionToken}`,
  },
  body: JSON.stringify(payload),
});

const data = await response.json();
console.log(data);
```

**Postman Setup:**
1. Open Postman and create a new request
2. Set method to `POST` and URL to `http://localhost:8001/react/query`
3. Go to the "Authorization" tab
4. Select "Bearer Token" type
5. Enter your session token in the Token field
6. Set body to JSON with your request payload

### Authentication Error Responses

When authentication fails, the API returns structured error responses:

#### Missing Session Token (401 Unauthorized)
```json
{
  "detail": "Authentication required: Missing or invalid Authorization header. Please include 'Bearer <token>' in the Authorization header.",
  "error_code": "MISSING_SESSION_TOKEN",
  "required_header": "Authorization"
}
```

#### Invalid Session Token (401 Unauthorized)
```json
{
  "detail": "Authentication failed: Invalid or expired session token.",
  "error_code": "INVALID_SESSION_TOKEN",
  "required_header": "Authorization"
}
```

### Security Best Practices

1. **Secure Token Storage**: Store session tokens securely in your frontend (consider httpOnly cookies for enhanced security)
2. **Token Expiration**: Implement proper token expiration and refresh mechanisms
3. **Secure Transmission**: Always use HTTPS in production to protect tokens in transit
4. **Token Validation**: Tokens are validated against the external auth service on every request
5. **Monitor Usage**: Check logs regularly for unauthorized access attempts
6. **Handle Expiration**: Implement proper error handling for expired tokens

### Troubleshooting Authentication

**Problem**: Getting 401 errors even with session token
- **Solution**: Verify the `Authorization` header format is correct: `Bearer <token>`
- **Solution**: Check that the token is not expired or invalid
- **Solution**: Ensure the external auth service at `api.kinship.codes/is-auth` is accessible

**Problem**: Token not being accepted
- **Solution**: Verify the token format and ensure it's the same token used by your frontend
- **Solution**: Check that the token hasn't expired
- **Solution**: Test the token directly against the auth service

**Problem**: CORS errors in browser
- **Solution**: The API includes CORS headers in error responses, but ensure your frontend handles 401 responses properly
- **Solution**: Implement proper token refresh logic in your frontend

## API Endpoints

### GET /
Health check and API information

### POST /react/query
Submit a query using ReACT (Reasoning and Acting) logic with MCP tools

```json
{
  "instructions": "SYSTEM_PROMPT_HERE",
  "agentId": "CHAT_AGENT_KEY",
  "bot_id": "CHAT_AGENT_ID",
  "aiModel": "gpt-5.2",
  "namespaces": ["CHAT_AGENT_KEY", "PUBLIC"],
  "query": "USER_MESSAGE_CONTENT",
}
```

**Response:**
```json
{
  "success": true,
  "namespaces": ["PUBLIC"],
  "successful_namespaces": ["PUBLIC"],
  "skipped_namespaces": [],
  "query": "What is blockchain technology?",
  "result": "Blockchain technology is...",
  "execution_time_seconds": 2.34,
  "timestamp": "2025-01-15T10:30:00",
  "tools_used": ["UnstructuredDB"]
}
```

### POST /react/stream
Submit a query with real-time streaming response using Server-Sent Events (SSE)

**Request:** Same format as `/react/query` endpoint

**Response:** Streaming data in SSE format:
```
event: connected
data: {"type": "connected", "message": "Stream initialized"}

event: processing
data: {"type": "processing", "message": "Processing..."}

event: chunk
data: {"type": "chunk", "content": "A"}

event: chunk
data: {"type": "chunk", "content": " kin"}

event: chunk
data: {"type": "chunk", "content": "ship"}

event: chunk
data: {"type": "chunk", "content": " bot"}

event: chunk
data: {"type": "chunk", "content": " is"}

event: chunk
data: {"type": "chunk", "content": " a"}

event: chunk
data: {"type": "chunk", "content": " chatbot"}

event: chunk
data: {"type": "chunk", "content": " designed"}

event: chunk
data: {"type": "chunk", "content": " to"}

event: chunk
data: {"type": "chunk", "content": " foster"}

event: chunk
data: {"type": "chunk", "content": " an"}

event: chunk
data: {"type": "chunk", "content": " ongoing"}

event: chunk
data: {"type": "chunk", "content": ","}

event: chunk
data: {"type": "chunk", "content": " relationship"}

event: chunk
data: {"type": "chunk", "content": "-like"}

event: chunk
data: {"type": "chunk", "content": " connection"}

event: chunk
data: {"type": "chunk", "content": " with"}

event: chunk
data: {"type": "chunk", "content": " a"}

event: chunk
data: {"type": "chunk", "content": " user"}

event: chunk
data: {"type": "chunk", "content": " by"}

event: chunk
data: {"type": "chunk", "content": " being"}

event: chunk
data: {"type": "chunk", "content": " personable"}

event: chunk
data: {"type": "chunk", "content": " and"}

event: chunk
data: {"type": "chunk", "content": " supportive"}

event: chunk
data: {"type": "chunk", "content": ","}

event: chunk
data: {"type": "chunk", "content": " remembering"}

event: chunk
data: {"type": "chunk", "content": " context"}

event: chunk
data: {"type": "chunk", "content": " over"}

event: chunk
data: {"type": "chunk", "content": " time"}

event: chunk
data: {"type": "chunk", "content": ","}

event: chunk
data: {"type": "chunk", "content": " and"}

event: chunk
data: {"type": "chunk", "content": " focusing"}

event: chunk
data: {"type": "chunk", "content": " on"}

event: chunk
data: {"type": "chunk", "content": " companionship"}

event: chunk
data: {"type": "chunk", "content": " or"}

event: chunk
data: {"type": "chunk", "content": " emotional"}

event: chunk
data: {"type": "chunk", "content": " support"}

event: chunk
data: {"type": "chunk", "content": " rather"}

event: chunk
data: {"type": "chunk", "content": " than"}

event: chunk
data: {"type": "chunk", "content": " just"}

event: chunk
data: {"type": "chunk", "content": " completing"}

event: chunk
data: {"type": "chunk", "content": " tasks"}

event: chunk
data: {"type": "chunk", "content": "."}

event: complete
data: {"type": "complete", "full_response": "A kinship bot is a chatbot designed to foster an ongoing, relationship-like connection with a user by being personable and supportive, remembering context over time, and focusing on companionship or emotional support rather than just completing tasks."}
```

### GET /health
Comprehensive health check of all services

**Response:**
```json
    {
      "status":"healthy",
      "mcp_servers":
              {
                "unstructured_db":"healthy",
                "structured_db":"healthy"
              },
      "agent_ready":true,
      "tools_count":0,
      "version":"2.0.0"
    }
```

## MCP Tools

### Available Tools

#### UnstructuredDB Tool
- **Purpose**: Vector similarity search using Pinecone database
- **Namespace**: PUBLIC (configurable)
- **Embedding Model**: Google's text-embedding-004
- **Functionality**: Searches for similar information and returns top 5 results
- **Use Case**: Information queries, facts, concepts, explanations


#### Solana Tool
- **Purpose**: To transfer SOL and special tokens using chat bot
- **Functionality**: Transfer SOL and SPL tokens, and retrieve a wallet public key by username
- **Use Case**: Transaction and retrieve the wallet public key

#### BlueSky Tool
- **Purpose**: To create a post in Bluesky
- **Functionality**: create a post in Bluesky
- **Use Case**: To create a post in Bluesky

### Tool Integration

The ReACT agent automatically determines when to use tools based on:
- Query complexity and specificity
- Need for current or specialized information
- User instructions and context

## Error Handling

The API includes comprehensive error handling:
- Authentication failures with descriptive messages
- Invalid request validation
- MCP server connection failures
- Tool execution errors
- Detailed logging for debugging

## Logging

The application provides detailed logging for:
- Authentication attempts and results
- Query processing with chat context
- Tool usage and results
- MCP server connectivity
- Error conditions and debugging

## Health Check

The `/health` endpoint provides information about:
- MCP server connectivity
- Agent readiness
- Available tools count
- Overall system health