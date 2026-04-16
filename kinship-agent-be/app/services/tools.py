"""
Kinship Agent - Tool Service

Handles credential verification and encryption.
Returns access_token and refresh_token for storage.

CHANGES:
- verify_google_credentials now accepts tokens directly (from OAuth flow)
- Google OAuth tokens are verified by calling userinfo endpoint
"""

from typing import Dict, Any
import json
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Encryption
# ─────────────────────────────────────────────────────────────────────────────


def _get_encryption_key() -> bytes:
    """Get encryption key from settings or derive from secret."""
    encryption_key = getattr(settings, 'encryption_key', None)
    
    if encryption_key and len(encryption_key) == 44:
        return encryption_key.encode()
    
    secret = getattr(settings, 'secret_key', 'default-secret-key-change-me')
    salt = b'kinship_tool_credentials'
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(secret.encode()))


def encrypt_credentials(credentials: Dict[str, Any]) -> str:
    """Encrypt credentials dict to string."""
    key = _get_encryption_key()
    fernet = Fernet(key)
    return fernet.encrypt(json.dumps(credentials).encode()).decode()


def decrypt_credentials(encrypted_data: str) -> Dict[str, Any]:
    """Decrypt string back to credentials dict."""
    key = _get_encryption_key()
    fernet = Fernet(key)
    return json.loads(fernet.decrypt(encrypted_data.encode()).decode())


# Aliases for dict-based credentials (used by new array-based ToolConnection)
encrypt_credentials_dict = encrypt_credentials
decrypt_credentials_dict = decrypt_credentials


# ─────────────────────────────────────────────────────────────────────────────
# Bluesky Verification
# ─────────────────────────────────────────────────────────────────────────────


async def verify_bluesky_credentials(handle: str, app_password: str) -> Dict[str, Any]:
    """
    Verify Bluesky credentials.
    
    Only returns handle and app_password info - no tokens needed.
    Bluesky uses handle + app_password directly for authentication.
    """
    import httpx
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://bsky.social/xrpc/com.atproto.server.createSession",
                json={"identifier": handle, "password": app_password},
                timeout=30.0,
            )
            
            if response.status_code != 200:
                error = response.json() if response.content else {}
                return {"success": False, "error": error.get("message", "Authentication failed")}
            
            data = response.json()
            
            # Only return external info - NO tokens for Bluesky
            # Bluesky uses handle + app_password directly
            return {
                "success": True,
                "external_user_id": data.get("did"),
                "external_handle": data.get("handle"),  # Without @, added in API
            }
                
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Telegram Verification
# ─────────────────────────────────────────────────────────────────────────────


async def verify_telegram_credentials(bot_token: str) -> Dict[str, Any]:
    """Verify Telegram bot token."""
    import httpx
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getMe",
                timeout=30.0,
            )
            
            if response.status_code != 200:
                return {"success": False, "error": "Invalid bot token"}
            
            data = response.json()
            if not data.get("ok"):
                return {"success": False, "error": "Invalid bot token"}
            
            result = data.get("result", {})
            
            return {
                "success": True,
                "external_user_id": str(result.get("id")),
                "external_handle": result.get("username"),  # Without @, added in API
            }
                
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Google Verification - Accepts OAuth tokens directly
# ─────────────────────────────────────────────────────────────────────────────


async def verify_google_credentials(credentials: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verify Google OAuth credentials.
    
    Accepts OAuth tokens obtained from the OAuth callback flow.
    Verifies by calling Google userinfo endpoint to get user details.
    """
    import httpx
    
    # Get access token from credentials (handle both camelCase and snake_case)
    access_token = credentials.get("accessToken") or credentials.get("access_token")
    refresh_token = credentials.get("refreshToken") or credentials.get("refresh_token", "")
    email = credentials.get("email", "")
    name = credentials.get("name", "")
    
    if not access_token:
        return {"success": False, "error": "No access token provided"}
    
    try:
        # Verify token by calling userinfo endpoint
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0,
            )
            
            if response.status_code != 200:
                return {"success": False, "error": "Invalid or expired access token"}
            
            userinfo = response.json()
            
            # Use values from userinfo, fallback to provided values
            verified_email = userinfo.get("email") or email
            verified_name = userinfo.get("name") or name
            user_id = userinfo.get("id") or userinfo.get("sub", "")
            
            return {
                "success": True,
                "external_user_id": user_id,
                "external_handle": verified_email,  # Use email as handle (no @ prefix)
                "access_token": access_token,
                "refresh_token": refresh_token,
                "email": verified_email,
                "name": verified_name,
            }
                
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Solana Verification
# ─────────────────────────────────────────────────────────────────────────────


async def verify_solana_credentials(credentials: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verify Solana connection.
    
    No credentials required - just marks as connected.
    """
    return {
        "success": True,
        "external_user_id": None,
        "external_handle": None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Generic Router
# ─────────────────────────────────────────────────────────────────────────────


async def verify_tool_credentials(tool_name: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
    """Verify credentials for any tool."""
    if tool_name == "bluesky":
        return await verify_bluesky_credentials(
            handle=credentials.get("handle", ""),
            app_password=credentials.get("app_password", ""),
        )
    
    elif tool_name == "telegram":
        return await verify_telegram_credentials(
            bot_token=credentials.get("bot_token", ""),
        )
    
    elif tool_name == "google":
        # Google accepts OAuth tokens directly
        return await verify_google_credentials(credentials)
    
    elif tool_name == "solana":
        return await verify_solana_credentials(credentials)
    
    else:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}