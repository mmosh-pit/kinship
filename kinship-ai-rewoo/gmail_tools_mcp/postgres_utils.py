"""
PostgreSQL utilities for Gmail MCP Server.

Handles:
- PostgreSQL connection and queries
- Credential encryption/decryption (same logic as kinship-agent)
- Worker agent lookups from agents table
- Tool connection lookups from tool_connections table
- Access control validation
"""

import os
import json
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Support both POSTGRES_DATABASE_URL and DATABASE_URL
POSTGRES_DATABASE_URL = os.getenv("POSTGRES_DATABASE_URL") or os.getenv("DATABASE_URL")
ENCRYPTION_SECRET_KEY = os.getenv("ENCRYPTION_SECRET_KEY", "default-secret-key-change-me")
REFRESH_GRACE_PERIOD = timedelta(minutes=2)

# Initialize PostgreSQL connection
pg_engine = None
pg_session_factory = None

if POSTGRES_DATABASE_URL:
    try:
        # Convert async URL to sync if needed
        sync_url = POSTGRES_DATABASE_URL.replace("+asyncpg", "")
        pg_engine = create_engine(sync_url, pool_pre_ping=True)
        pg_session_factory = sessionmaker(bind=pg_engine)
        logger.info(f"✅ Connected to PostgreSQL")
    except Exception as e:
        logger.error(f"❌ Failed to connect to PostgreSQL: {e}")
        pg_engine = None
        pg_session_factory = None
else:
    logger.warning("⚠️ POSTGRES_DATABASE_URL not configured - PostgreSQL features disabled")


# ─────────────────────────────────────────────────────────────────────────────
# Encryption / Decryption (Same logic as kinship-agent)
# ─────────────────────────────────────────────────────────────────────────────


def _get_encryption_key() -> bytes:
    """
    Get encryption key from settings or derive from secret.
    
    Uses the same logic as kinship-agent/app/services/tools.py
    """
    # Check if encryption key is a valid 44-char base64 Fernet key
    if ENCRYPTION_SECRET_KEY and len(ENCRYPTION_SECRET_KEY) == 44:
        return ENCRYPTION_SECRET_KEY.encode()
    
    # Derive key from secret using PBKDF2
    secret = ENCRYPTION_SECRET_KEY or "default-secret-key-change-me"
    salt = b'kinship_tool_credentials'
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(secret.encode()))


def decrypt_credentials(encrypted_data: str) -> Dict[str, Any]:
    """
    Decrypt credentials string back to dict.
    
    Uses the same logic as kinship-agent/app/services/tools.py
    """
    if not encrypted_data:
        return {}
    
    try:
        key = _get_encryption_key()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted_data.encode()).decode()
        return json.loads(decrypted)
    except Exception as e:
        logger.error(f"Failed to decrypt credentials: {e}")
        return {}


def encrypt_credentials(credentials: Dict[str, Any]) -> str:
    """
    Encrypt credentials dict to string.
    
    Uses the same logic as kinship-agent/app/services/tools.py
    """
    try:
        key = _get_encryption_key()
        fernet = Fernet(key)
        return fernet.encrypt(json.dumps(credentials).encode()).decode()
    except Exception as e:
        logger.error(f"Failed to encrypt credentials: {e}")
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL Queries
# ─────────────────────────────────────────────────────────────────────────────


def get_worker_agent_by_id(worker_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch worker agent info from PostgreSQL agents table.
    
    Returns:
    {
        "id": str,
        "name": str,
        "wallet": str (creator wallet),
        "type": str,
        "status": str,
        ...
    }
    """
    if not pg_session_factory or not worker_id:
        return None
    
    try:
        session = pg_session_factory()
        result = session.execute(
            text("""
                SELECT id, name, handle, type, status, wallet, parent_id, created_at
                FROM agents
                WHERE id = :worker_id
            """),
            {"worker_id": worker_id}
        )
        row = result.fetchone()
        session.close()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "name": row[1],
            "handle": row[2],
            "type": row[3],
            "status": row[4],
            "wallet": row[5],  # This is the creator's wallet
            "parent_id": row[6],
            "created_at": row[7],
        }
    except Exception as e:
        logger.error(f"Failed to fetch worker agent: {e}")
        return None


def get_tool_connection_by_worker_id(worker_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch tool connection from PostgreSQL tool_connections table.
    
    Returns:
    {
        "id": str,
        "worker_id": str,
        "tool_names": list,
        "credentials_encrypted": str,
        "external_handles": dict,
        "status": str,
        ...
    }
    """
    if not pg_session_factory or not worker_id:
        return None
    
    try:
        session = pg_session_factory()
        result = session.execute(
            text("""
                SELECT id, worker_id, worker_agent_name, tool_names, 
                       credentials_encrypted, external_handles, external_user_ids, status
                FROM tool_connections
                WHERE worker_id = :worker_id AND status = 'active'
            """),
            {"worker_id": worker_id}
        )
        row = result.fetchone()
        session.close()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "worker_id": row[1],
            "worker_agent_name": row[2],
            "tool_names": row[3] or [],
            "credentials_encrypted": row[4],
            "external_handles": row[5] or {},
            "external_user_ids": row[6] or {},
            "status": row[7],
        }
    except Exception as e:
        logger.error(f"Failed to fetch tool connection: {e}")
        return None


def update_tool_connection_credentials(worker_id: str, provider: str, new_creds: Dict[str, Any]) -> bool:
    """
    Update tool connection credentials in PostgreSQL after token refresh.
    """
    if not pg_session_factory or not worker_id:
        return False
    
    try:
        # Get current connection
        connection = get_tool_connection_by_worker_id(worker_id)
        if not connection:
            return False
        
        # Decrypt existing credentials
        current_creds = decrypt_credentials(connection.get("credentials_encrypted", ""))
        
        # Update the provider's credentials
        current_creds[provider] = new_creds
        
        # Encrypt and save
        encrypted = encrypt_credentials(current_creds)
        
        session = pg_session_factory()
        session.execute(
            text("""
                UPDATE tool_connections
                SET credentials_encrypted = :creds, updated_at = :updated_at
                WHERE worker_id = :worker_id
            """),
            {
                "creds": encrypted,
                "updated_at": datetime.utcnow(),
                "worker_id": worker_id
            }
        )
        session.commit()
        session.close()
        
        logger.info(f"Updated credentials for worker {worker_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to update tool connection credentials: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Credential Fetching with PostgreSQL Support
# ─────────────────────────────────────────────────────────────────────────────


def get_google_credentials_from_postgres(worker_id: str) -> Dict[str, Any]:
    """
    Fetch and build Google credentials from PostgreSQL tool_connections table.
    
    Returns:
    {
        "success": bool,
        "message": str,
        "creds": google.oauth2.credentials.Credentials | None
    }
    """
    # Get tool connection
    connection = get_tool_connection_by_worker_id(worker_id)
    
    if not connection:
        return {
            "success": False,
            "message": f"No tool connection found for worker_id={worker_id}",
            "creds": None,
        }
    
    # Check if Google is connected
    tool_names = connection.get("tool_names", [])
    if "google" not in tool_names:
        return {
            "success": False,
            "message": "Google not connected for this worker",
            "creds": None,
        }
    
    # Decrypt credentials
    all_creds = decrypt_credentials(connection.get("credentials_encrypted", ""))
    
    if not all_creds or "google" not in all_creds:
        return {
            "success": False,
            "message": "Google credentials not found in tool connection",
            "creds": None,
        }
    
    google_creds = all_creds["google"]
    
    # Extract tokens (handle both camelCase and snake_case)
    access_token = google_creds.get("access_token") or google_creds.get("accessToken")
    refresh_token = google_creds.get("refresh_token") or google_creds.get("refreshToken")
    expires_at_ms = google_creds.get("expires_at") or google_creds.get("expiresAt")
    
    if not access_token:
        return {
            "success": False,
            "message": "Access token missing in Google credentials",
            "creds": None,
        }
    
    # Build expiry datetime
    expires_at = None
    if expires_at_ms:
        expires_at = datetime.utcfromtimestamp(expires_at_ms / 1000)
    
    # Build Google Credentials object
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=[
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
        ],
    )
    
    creds.expiry = expires_at
    
    # Check if token needs refresh
    now = datetime.utcnow()
    refresh_threshold = now + REFRESH_GRACE_PERIOD
    
    if not creds.expiry or creds.expiry <= refresh_threshold:
        if not refresh_token:
            return {
                "success": False,
                "message": "Access token expired and refresh token missing",
                "creds": None,
            }
        
        logger.info(f"Refreshing Google access token for worker_id={worker_id}")
        
        try:
            creds.refresh(Request())
        except Exception as e:
            logger.error(f"Google token refresh failed for worker_id={worker_id}: {e}")
            return {
                "success": False,
                "message": "Google token refresh failed",
                "creds": None,
            }
        
        # Convert expiry to naive UTC
        refreshed_expiry = creds.expiry
        if refreshed_expiry and refreshed_expiry.tzinfo:
            refreshed_expiry = refreshed_expiry.astimezone(timezone.utc).replace(tzinfo=None)
        
        # Update PostgreSQL with new tokens
        updated_creds = {
            "access_token": creds.token,
            "refresh_token": refresh_token,  # Keep original refresh token
            "expires_at": int(refreshed_expiry.timestamp() * 1000) if refreshed_expiry else None,
            "email": google_creds.get("email"),
            "name": google_creds.get("name"),
        }
        
        update_tool_connection_credentials(worker_id, "google", updated_creds)
        
        creds.expiry = refreshed_expiry
        logger.info(f"Google token refreshed and stored for worker_id={worker_id}")
    
    return {
        "success": True,
        "message": "Google credentials ready (from PostgreSQL)",
        "creds": creds,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Access Control
# ─────────────────────────────────────────────────────────────────────────────


def check_wallet_is_creator(wallet: str, worker_id: str) -> Dict[str, Any]:
    """
    Check if the provided wallet matches the worker's creator wallet.
    
    Returns:
    {
        "is_creator": bool,
        "creator_wallet": str | None,
        "worker_info": dict | None,
        "message": str
    }
    """
    logger.info(f"[check_wallet_is_creator] Checking wallet={wallet} against worker_id={worker_id}")
    
    if not worker_id:
        logger.warning("[check_wallet_is_creator] worker_id is empty/None")
        return {
            "is_creator": False,
            "creator_wallet": None,
            "worker_info": None,
            "message": "worker_id is required",
        }
    
    # Get worker agent info
    worker_info = get_worker_agent_by_id(worker_id)
    logger.info(f"[check_wallet_is_creator] worker_info: {worker_info}")
    
    if not worker_info:
        logger.warning(f"[check_wallet_is_creator] Worker agent not found: {worker_id}")
        return {
            "is_creator": False,
            "creator_wallet": None,
            "worker_info": None,
            "message": f"Worker agent not found: {worker_id}",
        }
    
    creator_wallet = worker_info.get("wallet")
    logger.info(f"[check_wallet_is_creator] creator_wallet from worker_info: {creator_wallet}")
    
    if not creator_wallet:
        logger.warning(f"[check_wallet_is_creator] Worker agent {worker_id} has no creator wallet")
        return {
            "is_creator": False,
            "creator_wallet": None,
            "worker_info": worker_info,
            "message": "Worker agent has no creator wallet",
        }
    
    is_creator = wallet == creator_wallet
    logger.info(f"[check_wallet_is_creator] wallet={wallet} == creator_wallet={creator_wallet} => is_creator={is_creator}")
    
    return {
        "is_creator": is_creator,
        "creator_wallet": creator_wallet,
        "worker_info": worker_info,
        "message": "Creator match" if is_creator else "Not creator",
    }


def get_creator_email_from_mongodb(creator_wallet: str, users_collection) -> Optional[str]:
    """
    Fetch creator's email from MongoDB mmosh-users collection.
    
    This is used to verify that non-creator users can only send to the creator.
    """
    if users_collection is None or not creator_wallet:
        return None
    
    try:
        user = users_collection.find_one(
            {"wallet": creator_wallet},
            {"email": 1}
        )
        
        if user:
            return user.get("email")
        return None
    except Exception as e:
        logger.error(f"Failed to fetch creator email from MongoDB: {e}")
        return None


def validate_send_access(
    wallet: str,
    worker_id: str,
    receiver_email: str,
    users_collection
) -> Dict[str, Any]:
    """
    Validate if the user has permission to send email to the receiver.
    
    Rules:
    - If wallet == creator_wallet: FULL ACCESS (can send to anyone)
    - If wallet != creator_wallet: Can ONLY send to creator's email
    
    Returns:
    {
        "allowed": bool,
        "is_creator": bool,
        "receiver_is_creator": bool,  # True if receiver email matches creator email
        "message": str
    }
    """
    # Check if wallet is creator
    creator_check = check_wallet_is_creator(wallet, worker_id)
    
    if creator_check["is_creator"]:
        # Creator has full access
        return {
            "allowed": True,
            "is_creator": True,
            "receiver_is_creator": False,
            "message": "Full access granted (creator)",
        }
    
    # Non-creator: Check if receiver is the creator
    creator_wallet = creator_check.get("creator_wallet")
    
    if not creator_wallet:
        return {
            "allowed": False,
            "is_creator": False,
            "receiver_is_creator": False,
            "message": "Cannot determine creator wallet",
        }
    
    # Get creator's email from MongoDB
    creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
    
    if not creator_email:
        return {
            "allowed": False,
            "is_creator": False,
            "receiver_is_creator": False,
            "message": "Creator email not found",
        }
    
    # Check if receiver is the creator
    if receiver_email.lower() == creator_email.lower():
        return {
            "allowed": True,
            "is_creator": False,
            "receiver_is_creator": True,  # Receiver is the creator
            "message": "Access granted (sending to creator)",
        }
    
    return {
        "allowed": False,
        "is_creator": False,
        "receiver_is_creator": False,
        "message": f"Non-creator users can only send emails to the creator ({creator_email})",
    }


def validate_read_only_access(wallet: str, worker_id: str) -> Dict[str, Any]:
    """
    Validate if the user has permission for read-only operations.
    
    Rules:
    - If wallet == creator_wallet: ALLOWED
    - If wallet != creator_wallet: BLOCKED
    
    Returns:
    {
        "allowed": bool,
        "is_creator": bool,
        "message": str
    }
    """
    creator_check = check_wallet_is_creator(wallet, worker_id)
    
    if creator_check["is_creator"]:
        return {
            "allowed": True,
            "is_creator": True,
            "message": "Access granted (creator)",
        }
    
    return {
        "allowed": False,
        "is_creator": False,
        "message": "Only the creator can access this tool",
    }


def check_wallet_has_google_in_postgres(wallet: str) -> Dict[str, Any]:
    """
    Check if a wallet is the creator of any agent that has Google credentials in PostgreSQL.
    
    This is used to verify Google connection for users whose credentials are stored
    in PostgreSQL (tool_connections) rather than MongoDB (googleTokens).
    
    Returns:
    {
        "success": bool,
        "has_google": bool,
        "message": str
    }
    """
    logger.info(f"[check_wallet_has_google_in_postgres] Checking PostgreSQL for wallet={wallet}")
    
    if pg_engine is None:
        logger.warning("[check_wallet_has_google_in_postgres] PostgreSQL engine is None - not configured")
        return {
            "success": False,
            "has_google": False,
            "message": "PostgreSQL not configured",
        }
    
    try:
        with pg_engine.connect() as conn:
            # Find ALL agents where this wallet is the creator
            logger.info(f"[check_wallet_has_google_in_postgres] Querying agents table for wallet={wallet}")
            agent_query = text("""
                SELECT id FROM agents 
                WHERE wallet = :wallet
            """)
            agent_results = conn.execute(agent_query, {"wallet": wallet}).fetchall()
            logger.info(f"[check_wallet_has_google_in_postgres] agents query results: {agent_results}")
            
            if not agent_results:
                logger.info(f"[check_wallet_has_google_in_postgres] No agent found with wallet={wallet}")
                return {
                    "success": True,
                    "has_google": False,
                    "message": "Wallet is not a creator of any agent",
                }
            
            # Check each agent for valid Google credentials
            for agent_row in agent_results:
                worker_id = agent_row[0]
                logger.info(f"[check_wallet_has_google_in_postgres] Checking worker_id={worker_id}")
                
                # Check if this agent has credentials in tool_connections
                tool_query = text("""
                    SELECT credentials_encrypted FROM tool_connections 
                    WHERE worker_id = :worker_id 
                    AND status = 'active'
                """)
                tool_result = conn.execute(tool_query, {"worker_id": worker_id}).fetchone()
                logger.info(f"[check_wallet_has_google_in_postgres] tool_connections for {worker_id}: {tool_result is not None}")
                
                if not tool_result:
                    logger.info(f"[check_wallet_has_google_in_postgres] No tool_connections record for worker_id={worker_id}, trying next...")
                    continue
                
                credentials_encrypted = tool_result[0]
                if not credentials_encrypted:
                    logger.info(f"[check_wallet_has_google_in_postgres] credentials_encrypted is empty for worker_id={worker_id}, trying next...")
                    continue
                
                logger.info(f"[check_wallet_has_google_in_postgres] Found encrypted credentials for {worker_id}, attempting decrypt...")
                
                # Try to decrypt and verify
                try:
                    credentials = decrypt_credentials(credentials_encrypted)
                    logger.info(f"[check_wallet_has_google_in_postgres] Decrypted credentials keys: {list(credentials.keys()) if credentials else 'None'}")
                    google_creds = credentials.get("google", {})
                    logger.info(f"[check_wallet_has_google_in_postgres] google_creds keys: {list(google_creds.keys()) if google_creds else 'None'}")
                    
                    has_access = bool(google_creds.get("access_token"))
                    has_refresh = bool(google_creds.get("refresh_token"))
                    logger.info(f"[check_wallet_has_google_in_postgres] has_access_token={has_access}, has_refresh_token={has_refresh}")
                    
                    if has_access or has_refresh:
                        logger.info(f"[check_wallet_has_google_in_postgres] ✅ Google credentials found for wallet={wallet} via worker_id={worker_id}")
                        return {
                            "success": True,
                            "has_google": True,
                            "message": f"Google account connected via PostgreSQL (worker_id={worker_id})",
                        }
                    else:
                        logger.info(f"[check_wallet_has_google_in_postgres] Google credentials incomplete for {worker_id}, trying next...")
                        continue
                except Exception as e:
                    logger.error(f"[check_wallet_has_google_in_postgres] Error decrypting credentials for {worker_id}: {e}")
                    continue
            
            # None of the agents had valid Google credentials
            logger.warning(f"[check_wallet_has_google_in_postgres] ❌ No valid Google credentials found for any agent of wallet={wallet}")
            return {
                "success": True,
                "has_google": False,
                "message": "No valid Google credentials found for any agent",
            }
                
    except Exception as e:
        logger.error(f"[check_wallet_has_google_in_postgres] Database error: {e}")
        return {
            "success": False,
            "has_google": False,
            "message": f"Database error: {str(e)}",
        }
