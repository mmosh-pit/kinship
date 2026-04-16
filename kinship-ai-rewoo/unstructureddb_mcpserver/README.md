# UnstructuredDB MCP Server

A Model Context Protocol (MCP) HTTP server that provides tools for searching and retrieving information from unstructured databases using Pinecone vector storage and Google's Generative AI.

## 🚀 Features

- **Vector Search**: Search through unstructured data using semantic embeddings
- **Multi-namespace Support**: Search across different data namespaces
- **MCP Protocol**: Standardized interface for AI agents and tools
- **HTTP Server**: RESTful API endpoints for health checks and server status
- **Cloud Ready**: Dockerized for easy deployment to cloud platforms

## 📋 Prerequisites

- Python 3.11+
- Pinecone account and API key
- Google Generative AI API key
- Docker (for containerized deployment)

## 🛠️ Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd unstructureddb_mcpserver
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   Create a `.env` file in the project root:
   ```env
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX=your_index_name
   GENAI_API_KEY=your_google_genai_api_key
   ```

4. **Run the server**
   ```bash
   python mcp_server.py
   ```

The server will start on `http://localhost:8000`

### Docker Deployment

1. **Build the Docker image**
   ```bash
   docker build -t unstructureddb-mcp-server .
   ```

2. **Run the container**
   ```bash
   docker run -p 8000:8000 \
     -e PINECONE_API_KEY=your_key \
     -e PINECONE_INDEX=your_index \
     -e GENAI_API_KEY=your_key \
     unstructureddb-mcp-server
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PINECONE_API_KEY` | Your Pinecone API key | Yes |
| `PINECONE_INDEX` | Name of your Pinecone index | Yes |
| `GENAI_API_KEY` | Your Google Generative AI API key | Yes |

### Server Configuration

The server runs on:
- **Host**: `0.0.0.0` (all interfaces)
- **Port**: `8000`
- **Log Level**: `debug`

## 📡 API Endpoints

### Health Check
```http
GET /health
```
Returns server status and health information.

### Root Endpoint
```http
GET /
```
Returns server information and available endpoints.

### MCP Tools

The server exposes the following MCP tool:

#### `unstructured_db_search`
Searches the Pinecone vector database for relevant information.

**Parameters:**
- `query` (string): The search query
- `namespaces` (list, optional): List of namespace names to search in (default: `["PUBLIC"]`)

**Returns:**
- Raw text context from the most relevant matches

## 🚀 Cloud Deployment

For detailed deployment instructions to Google Cloud Run, see [DEPLOYMENT.md](DEPLOYMENT.md).

Quick deployment command:
```bash
# Make deployment script executable
chmod +x deploy.sh

# Set environment variables and deploy
export PROJECT_ID=your_project_id
export REGION=us-central1
./deploy.sh
```

## 🧪 Testing

### Health Check
```bash
curl http://localhost:8000/health
```

### Root Endpoint
```bash
curl http://localhost:8000/
```

### MCP Tool Testing
The MCP tools can be tested through any MCP-compatible client or agent.

## 📁 Project Structure

```
unstructureddb_mcpserver/
├── mcp_server.py          # Main server implementation
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker configuration
├── DEPLOYMENT.md         # Cloud deployment guide
└── README.md            # This file
```

## 🔍 How It Works

1. **Initialization**: The server starts and initializes connections to Pinecone and Google Generative AI
2. **Tool Registration**: MCP tools are registered with the FastMCP server
3. **Search Process**: When a search query is received:
   - The query is embedded using Google's embedding model
   - The embedding is used to search the Pinecone index
   - Results are sorted by relevance score
   - Raw text context is extracted and returned

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

[Add your license information here]

## 🆘 Support

For issues and questions:
- Check the [DEPLOYMENT.md](DEPLOYMENT.md) for deployment troubleshooting
- Review the server logs for error information
- Ensure all environment variables are properly set

## 🔗 Related Links

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Pinecone Documentation](https://docs.pinecone.io/)
- [Google Generative AI](https://ai.google.dev/)
- [FastMCP](https://github.com/fastmcp/fastmcp) 