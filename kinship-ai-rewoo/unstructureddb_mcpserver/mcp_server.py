"""
UnstructuredDB MCP HTTP Server (Single File Version)

This module provides the MCP (Model Context Protocol) HTTP server implementation
with the tool defined directly in the server file.
"""

import os
import logging
from typing import Optional, List
from dotenv import load_dotenv
from fastmcp import FastMCP, Context
from pinecone import Pinecone
import google.generativeai as genai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize clients
pinecone_api_key = os.getenv("PINECONE_API_KEY")
pinecone_index_name = os.getenv("PINECONE_INDEX", "mmosh-index")
genai_api_key = os.getenv("GENAI_API_KEY")

if pinecone_api_key and genai_api_key:
    pc = Pinecone(api_key=pinecone_api_key)
    pinecone_index = pc.Index(pinecone_index_name)
    genai.configure(api_key=genai_api_key)
else:
    pinecone_index = None
    genai = None





class UnstructuredDBMCPServer:
    """MCP Server implementation that exposes UnstructuredDB tools for various agents."""
    
    def __init__(self, name: str = "UnstructuredDB-Server"):
        logger.info(f"🚀 Initializing MCP Server: {name}")
        self.mcp_server = FastMCP(name)
        logger.info("🔧 Registering MCP tools")
        self._register_tools()
        self._add_custom_routes()

    def _register_tools(self):
        """Register the unstructured_db_search tool with the MCP server."""
        
        @self.mcp_server.tool
        async def unstructured_db_search(query: str, namespaces: Optional[List[str]] = None) -> str:
            """Searches a Pinecone vector database for information relevant to the user's query within the specified namespaces and returns raw text context.
            
            Args:
                query: The search query string
                namespaces: List of namespace names to search in (default: ["PUBLIC"])
            
            Returns:
                str: Raw text context from the most relevant matches
            """
            if namespaces is None:
                namespaces = ["PUBLIC"]
            
            print(f"[Tool] Searching for: '{query}' in namespaces: {namespaces}")

            try:
                # 1. Validate namespaces
                index_stats = pinecone_index.describe_index_stats()
                existing_namespaces = index_stats.get('namespaces', {}).keys()
                
                valid_namespaces = [ns for ns in namespaces if ns in existing_namespaces]
                if not valid_namespaces:
                    return "No valid namespaces were provided to search in."

                # 2. Generate embedding
                response = genai.embed_content(
                    model="models/embedding-001",
                    content=query,
                    task_type="retrieval_query"
                )
                query_embedding = response['embedding']
                
                # 3. Search namespaces
                all_matches = []
                for namespace in valid_namespaces:
                    search_response = pinecone_index.query(
                        namespace=namespace,
                        vector=query_embedding,
                        top_k=5,
                        include_metadata=True
                    )
                    print(f"[Tool] Found {len(search_response.matches)} matches in {namespace}")
                    all_matches.extend(search_response.matches)

                if not all_matches:
                    return f"No relevant information found for query: '{query}'."

                # 4. Extract and return context
                all_matches.sort(key=lambda x: x.score, reverse=True)
                context_pieces = [match.metadata['text'] for match in all_matches if match.metadata and 'text' in match.metadata]
                context = "\n\n".join(context_pieces)
                
                print(f"[Tool] Returning context with {len(context_pieces)} pieces")
                return context
                
            except Exception as e:
                print(f"[Tool] Error: {e}")
                return f"An error occurred during search: {str(e)}"
        
        self.unstructured_db_search = unstructured_db_search

    def _add_custom_routes(self):
        """Add custom routes for health check and workflow execution."""
        
        @self.mcp_server.custom_route("/health", methods=["GET"])
        async def health_check(request):
            from starlette.responses import JSONResponse
            response = JSONResponse({
                "status": "ok",
                "server": "UnstructuredDB-Server"
            })
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response

        @self.mcp_server.custom_route("/", methods=["GET"])
        async def root(request):
            from starlette.responses import JSONResponse
            response = JSONResponse({
                "server": "UnstructuredDB-Server",
                "status": "running",
                "description": "MCP server for UnstructuredDB tools",
                "endpoints": {
                    "health": "/health",
                    "mcp_tools": "Available via MCP protocol"
                }
            })
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response

    def run(self):
        self.mcp_server.run(
            transport="http",
            host="0.0.0.0",
            port=8000,
            log_level="debug",
        )


def main():
    """Main entry point for the UnstructuredDB MCP server."""
    try:
        server = UnstructuredDBMCPServer()
        server.run()
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        exit(1)


if __name__ == "__main__":
    main() 