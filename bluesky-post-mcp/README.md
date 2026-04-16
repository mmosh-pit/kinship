# CAT-FAWN Bluesky Bot

A Model Context Protocol (MCP) server that enables AI agents to create posts on Bluesky with automatic user tagging, threaded post support, and spam filtering.

## Features

- **Bluesky Post Creation**: Publish posts directly to Bluesky using agent-specific credentials
- **Automatic User Mentions**: Tag users from the Kinship Bots database who have registered Bluesky accounts
- **Threaded Post Support**: Automatically split long-form content into threaded posts when exceeding character limits
- **DID Resolution**: Resolve Bluesky handles to DIDs for accurate mention linking
- **Spam Filtering**: Filter out suspicious and invalid Bluesky accounts
- **Rate Limiting**: Built-in rate limiting for reliable and compliant post sequencing
- **Admin Authorization**: Secure permission system ensuring only authorized users can post

## Prerequisites

- Node.js (v16 or higher)
- MongoDB database
- Bluesky account credentials for each agent
- Valid authorization tokens for API access

## Installation

```bash
npm install
```

## Environment Configuration

Create a `.env` file in the root directory with the following variables:

```properties
PORT=5000
MONGO_URI=mongodb://localhost:27017?retryWrites=true&w=majority
DATABASE_NAME=live_forge
BLUE_SKY_BASE_RPC_URL=https://bsky.social/xrpc
NEXT_PUBLIC_BACKEND_URL=http://localhost:6050
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port number for the MCP server | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017?retryWrites=true&w=majority` |
| `DATABASE_NAME` | Name of the MongoDB database | `live_forge` |
| `BLUE_SKY_BASE_RPC_URL` | Bluesky API base URL | `https://bsky.social/xrpc` |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL for wallet verification | `http://localhost:6050` |

### Configuration Setup

The application uses these environment variables through the `config/config.ts` file:

```typescript
export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  databaseName: process.env.DATABASE_NAME,
  blueSkyBaseRpcUrl: process.env.BLUE_SKY_BASE_RPC_URL,
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL
};
```

## Database Setup

The application expects a MongoDB database with the following collections:

## Usage

### Starting the Server

```bash
npm start
```

The server will run on the configured port (default: 3000).

### Health Check

```bash
GET /health
```

Returns server health status.

### MCP Endpoints

#### Initialize Session
```http
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": { ... },
  "id": 1
}
```

#### Create Bluesky Post

Use the `create` tool through the MCP protocol:

**Parameters:**
- `text` (string, required): The content to publish on Bluesky
- `tagUsers` (boolean, optional, default: true): Whether to automatically tag Kinship Bots users
- `agentId` (string, required): The unique agent ID for retrieving Bluesky credentials
- `authorization` (string, required): Valid user authorization token

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create",
    "arguments": {
      "text": "Hello from my AI agent! This is an automated post.",
      "tagUsers": true,
      "agentId": "agent-123",
      "authorization": "Bearer token_here"
    }
  },
  "id": 2
}
```

## Post Features

### Character Limit Handling

- Posts under 300 bytes are published as single posts
- Posts over 300 bytes are automatically split into threaded posts
- Each thread post is marked with `🧵X of Y` indicators
- Thread replies are properly chained (each post replies to the previous one)

### User Tagging

When `tagUsers` is enabled, the system:
1. Queries users with Bluesky handles from the database
2. Filters out spam accounts based on patterns
3. Resolves handles to DIDs
4. Formats mentions using Bluesky's rich text facet system
5. Appends mentions at the end of the post

### Spam Filtering

The system filters out accounts matching these patterns:
- Handles with only numbers
- Very short handles (1-3 characters)
- Common spam prefixes (test, spam, bot, fake)
- Adult/gambling content keywords
- Repeated characters (e.g., aaaaa)
- Invalid handle formats

## Authorization & Permissions

Only users with the "wizard" role in the database can create posts. The authorization flow:

1. Extract public key from authorization token
2. Query user record from database
3. Verify user has "wizard" role
4. Proceed with post creation if authorized

## Error Handling

The server provides detailed error messages for common scenarios:
- Missing authorization token
- Wallet not found
- Insufficient permissions
- Bluesky not connected for agent
- Authentication failures
- Post creation errors

## API Response Format

All tool responses follow this format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Response message here",
      "_meta": {}
    }
  ]
}
```

## Rate Limiting

- 500ms delay between threaded post replies
- Built-in rate limiting for API compliance
- Prevents overwhelming the Bluesky API

## Security Considerations

- Credentials are stored securely in the database
- Authorization tokens are validated on every request
- Role-based access control for post creation
- CORS enabled for specified origins

## Development

### Project Structure

```
├── config/
│   ├── config.ts          # Application configuration
│   └── dbClient.ts        # Database connection
├── services/
│   └── httpClient.ts      # HTTP client setup
├── server.ts              # Main application file
└── README.md
```

### Dependencies

- `express`: Web server framework
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `axios`: HTTP client for Bluesky API
- `zod`: Schema validation
- `cors`: CORS middleware
- `mongodb`: Database driver

## Troubleshooting

### Common Issues

**"Bluesky is not connected in the bot"**
- Ensure agent credentials are stored in `mmosh-app-project-tools` collection

**"You don't have permission to create posts"**
- Verify user has "wizard" role in database

**"Failed to resolve handle"**
- Check that Bluesky handles are valid and active
- Verify network connectivity to Bluesky API

**Thread posts not appearing**
- Verify authentication token hasn't expired