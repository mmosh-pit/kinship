# PACE AI Chatbot MCP Server

This MCP (Model Context Protocol) server provides tools for saving final responses from PACE AI chatbot to MongoDB database. It follows the latest official MCP documentation and is designed to store only the final response after a complete survey/questionnaire session, not individual messages.

## Features

- **Final Response Storage**: Save only the final response from PACE AI chatbot after completing a survey
- **MongoDB Integration**: Robust MongoDB storage with proper error handling
- **MCP Protocol**: Follows latest official MCP documentation using FastMCP
- **HTTP API**: Additional REST endpoints for direct integration
- **Metadata Support**: Store additional context and survey questions

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd structureddb
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your MongoDB connection details
   ```

## Configuration

### Environment Variables

#### Local Development
Create a `.env` file with the following variables:

```env
# MongoDB Configuration
MONGO_URI=URL
MONGO_DB_NAME=your_database_name
MONGODB_COLLECTION=your_collection_name

# Optional Server Configuration
# HOST=0.0.0.0
# PORT=8000
# LOG_LEVEL=info
```

#### Google Cloud Run Deployment
When deploying on Google Cloud Run, use Google Secret Manager to store sensitive environment variables:

1. **Create secrets in Google Secret Manager**:
   ```bash
   # Create secrets
   echo -n "your_mongodb_connection_string" | gcloud secrets create MONGO_URI --data-file=-
   echo -n "your_database_name" | gcloud secrets create MONGO_DB_NAME --data-file=-
   echo -n "your_collection_name" | gcloud secrets create MONGODB_COLLECTION --data-file=-
   ```

2. **Deploy to Cloud Run with secrets**:
   ```bash
   gcloud run deploy structured-db-mcp-server \
     --image gcr.io/YOUR_PROJECT_ID/structured-db-mcp-server \
     --platform managed \
     --region us-central1 \
     --set-secrets MONGO_URI=MONGO_URI:latest \
     --set-secrets MONGO_DB_NAME=MONGO_DB_NAME:latest \
     --set-secrets MONGODB_COLLECTION=MONGODB_COLLECTION:latest \
     --allow-unauthenticated
   ```

3. **Alternative: Use environment variables directly**:
   ```bash
   gcloud run deploy structured-db-mcp-server \
     --image gcr.io/YOUR_PROJECT_ID/structured-db-mcp-server \
     --platform managed \
     --region us-central1 \
     --set-env-vars MONGO_URI="your_mongodb_connection_string" \
     --set-env-vars MONGO_DB_NAME="your_database_name" \
     --set-env-vars MONGODB_COLLECTION="your_collection_name" \
     --allow-unauthenticated
   ```

### MongoDB Setup

1. **Local MongoDB**:
   ```bash
   # Install MongoDB locally or use Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

2. **MongoDB Atlas (Cloud)**:
   - Create a cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Get your connection string and update `MONGO_URI`

## Usage

### Starting the Server

```bash
python mcp_server.py
```

The server will start on `http://0.0.0.0:8000` by default.

### MCP Tools

The server provides the following MCP tool:

#### `save_final_response`

Save the final response from PACE AI chatbot to MongoDB.

**Parameters**:
- `final_response` (str): Complete PACE Profile report text (the full generated report)
- `survey_questions` (list, optional): List of survey questions that were asked
- `metadata` (dict, optional): Additional metadata

**Example**:
```python
# Using MCP client
result = await client.call_tool("save_final_response", {
    "final_response": "Based on your survey responses, here is your personalized recommendation...",
    "survey_questions": ["What is your age?", "What are your goals?"],
    "metadata": {"survey_type": "health_assessment", "duration_minutes": 15}
})
```

**Important**: Call this tool ONLY when you have generated a complete PACE Profile report. This tool should be called after generating the final report, not during intermediate steps.

### HTTP API Endpoints

#### Health Check
```bash
curl http://localhost:8000/health
```

#### Root Endpoint
```bash
curl http://localhost:8000/
```

## MongoDB Schema

The final responses are stored with the following schema:

```json
{
  "_id": "ObjectId",
  "final_response": "string",
  "survey_questions": ["array of strings"],
  "metadata": {
    "survey_type": "string",
    "duration_minutes": "number",
    "other_fields": "any"
  },
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

## Integration with PACE AI Chatbot

This MCP server is designed to work with PACE AI chatbot systems. Here's how to integrate:

1. **After Survey Completion**: When the PACE AI chatbot completes a survey/questionnaire session, call the `save_final_response` tool with the final response.

2. **Metadata Storage**: Store survey context, questions asked, and other relevant metadata.

## Error Handling

The server includes comprehensive error handling:

- **MongoDB Connection Errors**: Graceful handling of database connection issues
- **Validation Errors**: Proper validation of required fields
- **JSON Serialization**: Safe handling of ObjectId and datetime objects
- **Logging**: Detailed logging for debugging and monitoring

## Development

### Project Structure
```
structureddb/
├── mcp_server.py          # Main MCP server implementation
├── requirements.txt       # Python dependencies
├── env.example           # Environment variables template
├── Dockerfile            # Container configuration
└── README.md             # This file
```

### Dependencies

The project uses the following main dependencies:
- `fastmcp>=0.1.0` - FastMCP framework for MCP server implementation
- `pymongo>=4.6.0` - MongoDB driver for Python
- `python-dotenv>=1.0.0` - Environment variable management
- `pydantic>=2.5.0` - Data validation
- `requests>=2.31.0` - HTTP library for health checks

### Adding New Tools

To add new MCP tools:

1. Add the tool function in the `_register_tools` method
2. Use the `@self.mcp_server.tool` decorator
3. Add proper error handling and logging
4. Update the README with tool documentation

### Testing

Test the server endpoints:

```bash
# Health check
curl http://localhost:8000/health

# Root endpoint
curl http://localhost:8000/
```

## Deployment

### Docker Deployment

The project includes a Dockerfile for containerized deployment:

```bash
   # Build the Docker image
   docker build -t structured-db-mcp-server .
   
   # Run the container
   docker run -p 8080:8080 --env-file .env structured-db-mcp-server
```

**Note**: The Docker container exposes port 8080, while the default server runs on port 8000.

### Google Cloud Run Deployment

For production deployment on Google Cloud Run:

1. **Build and push the Docker image**:
   ```bash
   # Build the image
   docker build -t gcr.io/YOUR_PROJECT_ID/structured-db-mcp-server .
   
   # Push to Google Container Registry
   docker push gcr.io/YOUR_PROJECT_ID/structured-db-mcp-server
   ```

2. **Deploy to Cloud Run** (see Environment Variables section above for secret management):
   ```bash
   gcloud run deploy structured-db-mcp-server \
     --image gcr.io/YOUR_PROJECT_ID/structured-db-mcp-server \
     --platform managed \
     --region us-central1 \
     --port 8080 \
     --allow-unauthenticated
   ```

3. **Set up monitoring and logging**:
   ```bash
   # View logs
   gcloud logs tail --service=structured-db-mcp-server
   
   # Monitor metrics in Google Cloud Console
   # Navigate to Cloud Run > structured-db-mcp-server > Metrics
   ```

**Benefits of Cloud Run**:
- Automatic scaling based on demand
- Pay only for actual usage
- Built-in HTTPS and custom domains
- Integration with Google Cloud services
- Automatic container health checks

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please create an issue in the repository or contact the development team. 