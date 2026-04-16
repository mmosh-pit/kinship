"""
PACE AI Chatbot MCP Server

This MCP server provides tools for saving final responses from PACE AI chatbot
to MongoDB database. It follows the latest official MCP documentation.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from fastmcp import FastMCP
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import PyMongoError
from bson import ObjectId
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION")


# Initialize MongoDB client
try:
    mongo_client = MongoClient(MONGO_URI)
    mongo_db = mongo_client[MONGO_DB_NAME]
    mongo_collection = mongo_db[MONGODB_COLLECTION]
    checkpoints_collection = mongo_db["checkpoints"]
    progress_collection = mongo_db["checkpoint_progress"]
    logger.info(f"✅ Connected to MongoDB: {MONGO_URI}")
except Exception as e:
    logger.error(f"❌ Failed to connect to MongoDB: {e}")
    mongo_client = None
    mongo_db = None
    mongo_collection = None


class StructuredDBMCPServer:
    """MCP Server implementation for PACE AI chatbot final response storage."""
    
    def __init__(self, name: str = "StructuredDB-Server"):
        logger.info(f"🚀 Initializing MCP Server: {name}")
        self.mcp_server = FastMCP(name)
        logger.info("🔧 Registering MCP tools")
        self._register_tools()
        self._add_custom_routes()

    def _register_tools(self):
        """Register MCP tools for PACE AI chatbot operations."""
        
        @self.mcp_server.tool
        async def save_final_response(
            final_response: str,
            survey_questions: Optional[list] = None,
            metadata: Optional[Dict[str, Any]] = None
        ) -> str:
            """Save a complete PACE Profile report to MongoDB database.
            
            IMPORTANT: Call this tool ONLY when you have generated a complete PACE Profile report.
            
            This tool should be called after generating the final report, not during intermediate steps.
            
            Args:

                final_response: Complete PACE Profile report text (the full generated report)
                survey_questions: List of survey questions that were asked (optional)

            
            Returns:
                str: JSON response indicating success/failure and response ID
            """
            if mongo_collection is None:
                return '{"success": false, "message": "MongoDB connection not available"}'
            
            try:
                # Create timestamp
                created_at = datetime.now(timezone.utc)
                
                # Prepare document for MongoDB
                document = {
                    "final_response": final_response,
                    "survey_questions": survey_questions or [],
                    "metadata": metadata or {},
                    "created_at": created_at,
                    "updated_at": created_at
                }
                
                # Insert document into MongoDB
                result = mongo_collection.insert_one(document)
                
                if result.inserted_id:
                    logger.info(f"✅ Final response saved successfully")
                    return f'{{"success": true, "message": "Final response saved successfully", "response_id": "{str(result.inserted_id)}"}}'
                else:
                    logger.error(f"❌ Failed to save final response")
                    return '{"success": false, "message": "Failed to save final response"}'
                    
            except PyMongoError as e:
                logger.error(f"❌ MongoDB error saving final response: {e}")
                return f'{{"success": false, "message": "Database error: {str(e)}"}}'
            except Exception as e:
                logger.error(f"❌ Unexpected error saving final response: {e}")
                return f'{{"success": false, "message": "Unexpected error: {str(e)}"}}'

        # Explicitly assign the tool to ensure proper registration
        self.save_final_response = save_final_response


        @self.mcp_server.tool
        async def mark_checkpoint_complete(
            checkpoint_id: str, 
            user_id: str, 
            bot_id: str = "default_bot"
        ) -> str:
            """Mark a checkpoint as completed for a user.

            **WHEN TO USE THIS TOOL:**
            - You have successfully collected ALL required and optional attributes
            - save_checkpoint_attribute returned "all_attributes_collected": true
            - You are ready to finalize the checkpoint and move to the next one
            
            **WHAT THIS TOOL DOES:**
            - Validates that all attributes are actually collected
            - Marks the checkpoint as completed in the database
            - Adds a completion timestamp
            - Returns success/failure status
            
            **IMPORTANT:**
            - This tool will FAIL if any attributes are still uncollected
            - Only call after save_checkpoint_attribute confirms all are collected
            - After successful completion, the next checkpoint will be loaded automatically

            Args:
                checkpoint_id: The ID of the checkpoint that was completed
                user_id: The user's ID
                bot_id: The bot ID (optional, defaults to 'default_bot')

            Returns:
                str: JSON response indicating success/failure of marking completion
            """
            if mongo_db is None:
                return '{"success": false, "message": "MongoDB not available"}'
            try:
                completed_at = datetime.now(timezone.utc)
                progress = progress_collection.find_one({
                    "checkpoint_id": checkpoint_id,
                    "user_id": user_id,
                    "bot_id": bot_id
                })
                if not progress:
                    return f'{{"success": false, "message": "User progress not found"}}'

                # Check if ALL attributes (both required and optional) are collected
                missing = [
                    a["label"] for a in progress.get("attributes", [])
                    if not a.get("collected", False)
                ]
                if missing:
                    return f'{{"success": false, "message": "Cannot complete checkpoint. Not all attributes are collected. Missing: {missing}", "missing": {missing}}}'

                result = progress_collection.update_one(
                    {
                        "checkpoint_id": checkpoint_id,
                        "user_id": user_id,
                        "bot_id": bot_id
                    },
                    {"$set": {
                        "completed": True,
                        "completed_at": completed_at,
                        "updated_at": completed_at
                    }}
                )
                if result.modified_count > 0:
                    logger.info(f"✅ Checkpoint {checkpoint_id} marked complete for {user_id}")
                    return f'{{"success": true, "message": "Checkpoint completed successfully!", "checkpoint_completed": true, "next_action": "RELOAD_CHECKPOINT: Acknowledge completion briefly, then continue the conversation naturally. The system will automatically load the next checkpoint with new questions for you."}}'
                
                return f'{{"success": true, "message": "Already completed", "next_action": "Continue with the next checkpoint."}}'
            except Exception as e:
                logger.error(f"❌ Checkpoint complete error: {e}")
                return f'{{"success": false, "message": "{str(e)}"}}'

        self.mark_checkpoint_complete = mark_checkpoint_complete

        """
    Instructions for adding save_checkpoint_attribute tool to your existing MCP server

    Add this tool to your existing MCP server alongside your current tools
    (save_final_response, mark_checkpoint_complete)

    Copy this code and add it to your MCP server's _register_tools() method:
    """

        @self.mcp_server.tool
        async def save_checkpoint_attribute(
            checkpoint_id: str,
            attribute_label: str, 
            value: str,
            user_id: str,
            bot_id: str = "default_bot"
        ) -> str:
            """Save a user's response for a specific checkpoint attribute.

            **WHEN TO USE THIS TOOL:**
            - User has provided a value for a checkpoint attribute (weight, height, goal, etc.)
            - You need to persist the collected information to the checkpoint system
            - You are in the middle of checkpoint attribute collection workflow
            
            **WHAT THIS TOOL DOES:**
            - Saves the user's response for the specified attribute
            - Marks the attribute as collected
            - Returns the total progress (e.g., "3/4 attributes collected")
            - Indicates if all attributes are now collected via "all_attributes_collected" field
            
            **NEXT STEPS AFTER CALLING:**
            - Check the response's "all_attributes_collected" field
            - If true, immediately call mark_checkpoint_complete tool
            - If false, continue collecting remaining attributes

            Args:
                checkpoint_id: The ID of the checkpoint containing the attribute
                attribute_label: The label of the attribute being saved (e.g., "Current Weight")
                value: The user's response/value for this attribute
                user_id: The user's ID
                bot_id: The bot ID (optional, defaults to 'default_bot')

            Returns:
                str: JSON response with fields: success, message, collected_count, total_attributes, all_attributes_collected
            """
            if mongo_db is None:
                return '{"success": false, "message": "MongoDB not available"}'
            try:
                updated_at = datetime.now(timezone.utc)

                # Validate checkpoint template
                try:
                    template = checkpoints_collection.find_one(
                        {"_id": ObjectId(checkpoint_id), "bot_id": bot_id}
                    )
                except Exception:
                    template = checkpoints_collection.find_one(
                        {"_id": checkpoint_id, "bot_id": bot_id}
                    )
                if not template:
                    return f'{{"success": false, "message": "Checkpoint template not found"}}'

                # Prepare base progress document (if not existing)
                user_attrs = []
                for attr in template.get("attributes", []):
                    a = dict(attr)
                    a["value"] = None
                    a["collected"] = False
                    user_attrs.append(a)

                progress_doc = {
                    "checkpoint_id": checkpoint_id,
                    "bot_id": bot_id,
                    "user_id": user_id,
                    "attributes": user_attrs,
                    "completed": False,
                    "created_at": updated_at,
                    "updated_at": updated_at
                }

                # Atomic find-or-create
                progress_collection.find_one_and_update(
                    {
                        "checkpoint_id": checkpoint_id,
                        "user_id": user_id,
                        "bot_id": bot_id
                    },
                    {"$setOnInsert": progress_doc},
                    upsert=True,
                    return_document=ReturnDocument.AFTER
                )

                # Update the specific attribute
                update_result = progress_collection.update_one(
                    {
                        "checkpoint_id": checkpoint_id,
                        "user_id": user_id,
                        "bot_id": bot_id,
                        "attributes.label": attribute_label
                    },
                    {
                        "$set": {
                            "attributes.$.value": value,
                            "attributes.$.collected": True,
                            "updated_at": updated_at
                        }
                    }
                )

                if update_result.matched_count == 0:
                    return f'{{"success": false, "message": "Attribute not found"}}'

                # Check progress completion
                doc = progress_collection.find_one({
                    "checkpoint_id": checkpoint_id,
                    "user_id": user_id,
                    "bot_id": bot_id
                })

                if not doc:
                    return f'{{"success": false, "message": "Progress document not found"}}'

                attrs = doc.get("attributes", [])
                # Check ALL attributes (both required and optional)
                all_done = all(a.get("collected", False) for a in attrs)
                collected_count = sum(a.get("collected", False) for a in attrs)

                # Find next uncollected attribute
                next_attribute = None
                for attr in attrs:
                    if not attr.get("collected", False):
                        next_attribute = attr
                        break

                logger.info(
                    f"✅ Saved attribute '{attribute_label}' for user {user_id}. "
                    f"{collected_count}/{len(attrs)} collected."
                )

                # Provide next step guidance
                if all_done:
                    next_action = "Call mark_checkpoint_complete tool immediately to finish this checkpoint."
                elif next_attribute:
                    next_action = f"Ask user for: {next_attribute['label']} ({next_attribute['instructions']})"
                else:
                    next_action = "Continue with checkpoint completion."

                return (
                    f'{{"success": true, "message": "Saved", '
                    f'"attribute_label": "{attribute_label}", "value": "{value}", '
                    f'"collected_count": {collected_count}, '
                    f'"total_attributes": {len(attrs)}, '
                    f'"all_attributes_collected": {str(all_done).lower()}, '
                    f'"next_action": "{next_action}"}}'
                )

            except Exception as e:
                logger.error(f"❌ Attribute save error: {e}")
                return f'{{"success": false, "message": "{str(e)}"}}'

        self.save_checkpoint_attribute = save_checkpoint_attribute

        """
        IMPORTANT: After adding this tool to your MCP server:
        1. Restart your MCP server
        2. Your MCP server should now have 3 tools:
        - save_final_response
        - mark_checkpoint_complete
        - save_checkpoint_attribute

        3. Test with the enhanced checkpoint by sending: "Hi, I want to get fit"
        The LLM should act as FitCoach and collect the required attributes.
        """


    def _add_custom_routes(self):
        """Add custom HTTP routes for health check and server info only."""
        
        @self.mcp_server.custom_route("/health", methods=["GET"])
        async def health_check(request):
            from starlette.responses import JSONResponse
            
            # Check MongoDB connection
            mongo_status = "connected" if mongo_client and mongo_client.admin.command('ping') else "disconnected"
            
            response = JSONResponse({
                "status": "ok",
                "server": "StructuredDB-Server",
                "mongodb": mongo_status,
                "collections": {
                    "responses": MONGODB_COLLECTION
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response

        @self.mcp_server.custom_route("/", methods=["GET"])
        async def root(request):
            from starlette.responses import JSONResponse
            response = JSONResponse({
                "server": "StructuredDB-Server",
                "status": "running",
                "description": "MCP server for PACE AI chatbot final response storage",
                "endpoints": {
                    "health": "/health",
                    "mcp": "/mcp/ (MCP protocol endpoint)"
                },
                "tools": [
                    "save_final_response",
                    "mark_checkpoint_complete",
                    "save_checkpoint_attribute"
                ]
            })
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response

    def run(self):
        """Start the MCP server."""
        self.mcp_server.run(
            transport="http",
            host="0.0.0.0",
            port=8080,
            log_level="info",
        )


def main():
    """Main entry point for the PACE AI Chatbot MCP server."""
    try:
        server = StructuredDBMCPServer()
        server.run()
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        exit(1)


if __name__ == "__main__":
    main() 