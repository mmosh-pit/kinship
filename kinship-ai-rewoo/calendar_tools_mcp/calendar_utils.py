"""
Common utility functions for Google Calendar MCP tools.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from pymongo import MongoClient

# Import PostgreSQL utilities
from postgres_utils import (
    check_wallet_is_creator,
    get_google_credentials_from_postgres,
    get_creator_email_from_mongodb,
    validate_send_access,
    validate_read_only_access,
    check_wallet_has_google_in_postgres,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")
GOOGLE_COLLECTION = "googleTokens"
USERS_COLLECTION = "mmosh-users"
MEMBERSHIP_COLLECTION = "mmosh-app-user-membership"
REFRESH_GRACE_PERIOD = timedelta(minutes=2)

mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB_NAME]
google_token_collection = mongo_db[GOOGLE_COLLECTION]
users_collection = mongo_db[USERS_COLLECTION]
membership_collection = mongo_db[MEMBERSHIP_COLLECTION]


def to_naive_utc(dt: datetime | None) -> datetime | None:
    """
    Convert datetime to naive UTC (required by google-auth internals).
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def get_wallet_by_username(filter: str) -> Dict:
    """
    Fetch wallet and email using username OR email OR wallet address.
    """
    if not filter:
        return {
            "success": False,
            "wallet": None,
            "email": None,
            "message": "Username or email or wallet-address is required",
        }

    query = {
        "$or": [
            {"profile.username": filter},
            {"email": filter},
            {"wallet": filter},
        ]
    }

    user = users_collection.find_one(query, {"wallet": 1, "email": 1})

    if not user:
        return {
            "success": True,
            "wallet": None,
            "email": None,
            "message": "User not found",
        }

    return {
        "success": True,
        "wallet": user.get("wallet"),
        "email": user.get("email"),
        "message": "User resolved",
    }


# def has_membership(filter: str) -> Dict:
#     """
#     Check if a user has an active membership.
#     """
#     user_result = get_wallet_by_username(filter)

#     if not user_result["success"]:
#         return {
#             "success": False,
#             "has_membership": False,
#             "wallet": None,
#             "email": None,
#             "message": user_result["message"],
#         }

#     wallet = user_result.get("wallet")
#     email = user_result.get("email")

#     if not wallet:
#         return {
#             "success": True,
#             "has_membership": False,
#             "wallet": None,
#             "email": email,
#             "message": "User does not have a wallet linked",
#         }

#     record = membership_collection.find_one({"wallet": wallet})

#     if not record:
#         return {
#             "success": True,
#             "has_membership": False,
#             "wallet": wallet,
#             "email": email,
#             "message": "No membership found",
#         }

#     expiry_str = record.get("expirydate")

#     if not expiry_str:
#         return {
#             "success": True,
#             "has_membership": False,
#             "wallet": wallet,
#             "email": email,
#             "message": "Membership expiry date missing",
#         }

#     try:
#         expiry_date = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
#     except Exception:
#         return {
#             "success": False,
#             "has_membership": False,
#             "wallet": wallet,
#             "email": email,
#             "message": "Invalid expiry date format",
#         }

#     if expiry_date <= datetime.now(timezone.utc):
#         return {
#             "success": True,
#             "has_membership": False,
#             "wallet": wallet,
#             "email": email,
#             "message": "Membership expired",
#         }


#     return {
#         "success": True,
#         "has_membership": True,
#         "wallet": wallet,
#         "email": email,
#         "message": "Active membership found",
#     }
def has_member(filter: str) -> Dict[str, Any]:
    """
    Check if a user is registered on the platform.

    IMPORTANT:
    - Membership / subscription / expiry is NOT required.
    - Any existing user in `mmosh-users` is allowed to use tools.

    Returns:
    {
        "success": bool,
        "has_membership": bool,   # True == registered user
        "wallet": str | None,
        "email": str | None,
        "message": str
    }
    """

    user_result = get_wallet_by_username(filter)

    if not user_result["success"]:
        return {
            "success": False,
            "has_membership": False,
            "wallet": None,
            "email": None,
            "message": user_result["message"],
        }

    wallet = user_result.get("wallet")
    email = user_result.get("email")

    # User not found in mmosh-users
    if not wallet and not email:
        return {
            "success": True,
            "has_membership": False,
            "wallet": None,
            "email": None,
            "message": "User not registered",
        }

    # User exists → allow access
    return {
        "success": True,
        "has_membership": True,
        "wallet": wallet,
        "email": email,
        "message": "Registered user",
    }


def get_google_credentials_by_wallet(wallet: str) -> Dict:
    """
    Fetch and refresh Google OAuth credentials for Calendar API.
    """
    token_doc = google_token_collection.find_one({"userId": wallet})

    if not token_doc:
        return {"success": False, "message": "No OAuth token found", "creds": None}

    access_token = token_doc.get("accessToken")
    refresh_token = token_doc.get("refreshToken")
    expires_at_ms = token_doc.get("expiresAt")

    if not access_token:
        return {"success": False, "message": "Access token missing", "creds": None}

    expires_at = None
    if expires_at_ms:
        expires_at = datetime.fromtimestamp(expires_at_ms / 1000, timezone.utc).replace(
            tzinfo=None
        )

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
    now = datetime.utcnow()

    if not creds.expiry or creds.expiry <= now + REFRESH_GRACE_PERIOD:
        if not refresh_token:
            return {
                "success": False,
                "message": "Token expired but no refresh token",
                "creds": None,
            }

        try:
            creds.refresh(Request())
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            return {"success": False, "message": "Token refresh failed", "creds": None}

        refreshed_expiry = to_naive_utc(creds.expiry)

        google_token_collection.update_one(
            {"userId": wallet},
            {
                "$set": {
                    "accessToken": creds.token,
                    "expiresAt": int(refreshed_expiry.timestamp() * 1000),
                    "updatedAt": datetime.utcnow(),
                }
            },
        )

        creds.expiry = refreshed_expiry

    return {"success": True, "message": "Calendar credentials ready", "creds": creds}


# def normalize_datetime(dt: str, tz: str) -> str:
#     """
#     Ensures RFC3339 datetime for Google Calendar.
#     """
#     if "T" in dt:
#         return dt

#     parsed = datetime.strptime(dt, "%Y-%m-%d %H:%M")
#     return parsed.replace(tzinfo=timezone.utc).isoformat()


def normalize_datetime(dt: str, tz: str) -> str:
    """
    Normalize datetime to RFC3339 **UTC** format required by Google Calendar.

    RULES (IMPORTANT):
    - Input datetime is assumed to be in the user's local timezone (`tz`)
      unless it already includes a timezone offset.
    - Output is ALWAYS UTC (ends with 'Z').
    - Prevents double timezone shifting issues.

    Examples:
    - ("2026-01-23 10:00", "Asia/Kolkata")
        → "2026-01-23T04:30:00Z"

    - ("2026-01-23T10:00+05:30", "Asia/Kolkata")
        → "2026-01-23T04:30:00Z"

    - ("2026-01-23T04:30:00Z", "UTC")
        → "2026-01-23T04:30:00Z"
    """
    import pytz
    from dateutil import parser as date_parser

    try:
        # Parse datetime (handles ISO, offsets, etc.)
        parsed = date_parser.parse(dt)

        # If datetime has NO timezone → assume it's in provided tz
        if parsed.tzinfo is None:
            try:
                tz_obj = pytz.timezone(tz)
            except Exception:
                logger.warning(f"Invalid timezone '{tz}', defaulting to UTC")
                tz_obj = pytz.UTC

            parsed = tz_obj.localize(parsed)

        # Convert to UTC
        parsed_utc = parsed.astimezone(pytz.UTC)

        # Return RFC3339 UTC string
        return parsed_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    except Exception as e:
        raise ValueError(f"Cannot normalize datetime '{dt}': {e}")


def has_connected_google_account(filter: str) -> Dict[str, Any]:
    """
    Check whether a registered user has connected a Google account.

    IMPORTANT:
    - User must exist in `mmosh-users`
    - Google OAuth must exist in `googleTokens` (MongoDB) OR `tool_connections` (PostgreSQL)
    - Token expiry / refresh is NOT validated here

    Returns:
    {
        "success": bool,
        "has_connected_google": bool,
        "message": str
    }
    """
    logger.info(f"[has_connected_google_account] Checking Google connection for filter='{filter}'")

    user_result = get_wallet_by_username(filter)
    logger.info(f"[has_connected_google_account] get_wallet_by_username result: {user_result}")

    if not user_result["success"]:
        logger.warning(f"[has_connected_google_account] User lookup failed: {user_result['message']}")
        return {
            "success": False,
            "has_connected_google": False,
            "message": user_result["message"],
        }

    wallet = user_result.get("wallet")
    email = user_result.get("email")
    logger.info(f"[has_connected_google_account] Found wallet={wallet}, email={email}")

    if not wallet and not email:
        logger.warning("[has_connected_google_account] No wallet or email found - user not registered")
        return {
            "success": True,
            "has_connected_google": False,
            "message": "User not registered",
        }

    # First check MongoDB (googleTokens collection)
    logger.info(f"[has_connected_google_account] Checking MongoDB googleTokens for wallet={wallet}")
    token_doc = google_token_collection.find_one(
        {
            "$or": [
                {"userId": wallet},
                {"agentId": wallet},
            ]
        },
        {
            "agentId": 1,
            "accessToken": 1,
            "refreshToken": 1,
        },
    )
    logger.info(f"[has_connected_google_account] MongoDB token_doc found: {token_doc is not None}")

    if token_doc:
        has_access = bool(token_doc.get("accessToken"))
        has_refresh = bool(token_doc.get("refreshToken"))
        logger.info(f"[has_connected_google_account] MongoDB token_doc: has_accessToken={has_access}, has_refreshToken={has_refresh}")
        if has_access or has_refresh:
            logger.info("[has_connected_google_account] ✅ Google account connected via MongoDB")
            return {
                "success": True,
                "has_connected_google": True,
                "message": "Google account connected (MongoDB)",
            }

    # MongoDB doesn't have the token - check PostgreSQL as fallback
    # This handles creators whose credentials are in tool_connections table
    logger.info(f"[has_connected_google_account] MongoDB check failed, trying PostgreSQL fallback for wallet={wallet}")
    if wallet:
        pg_result = check_wallet_has_google_in_postgres(wallet)
        logger.info(f"[has_connected_google_account] PostgreSQL result: {pg_result}")
        if pg_result.get("has_google"):
            logger.info("[has_connected_google_account] ✅ Google account connected via PostgreSQL")
            return {
                "success": True,
                "has_connected_google": True,
                "message": "Google account connected (PostgreSQL)",
            }

    logger.warning(f"[has_connected_google_account] ❌ Google account NOT connected for filter='{filter}'")
    return {
        "success": True,
        "has_connected_google": False,
        "message": "Google account not connected",
    }


def get_credentials_unified(
    wallet: str,
    worker_id: str
) -> Dict[str, Any]:
    """
    Unified credential fetching that supports both MongoDB and PostgreSQL.
    
    Logic:
    1. First try MongoDB credentials (existing flow)
    2. If MongoDB fails and wallet == creator wallet → use PostgreSQL credentials as fallback
    
    Returns:
    {
        "success": bool,
        "message": str,
        "creds": google.oauth2.credentials.Credentials | None,
        "is_creator": bool,
        "creator_wallet": str | None
    }
    """
    logger.info(f"[get_credentials_unified] wallet={wallet}, worker_id={worker_id}")
    
    # Check creator status (for access control)
    creator_check = check_wallet_is_creator(wallet, worker_id)
    is_creator = creator_check.get("is_creator", False)
    creator_wallet = creator_check.get("creator_wallet")
    logger.info(f"[get_credentials_unified] check_wallet_is_creator: is_creator={is_creator}, creator_wallet={creator_wallet}")
    
    # First try MongoDB credentials
    logger.info(f"Trying MongoDB credentials for wallet={wallet}")
    mongo_result = get_google_credentials_by_wallet(wallet)
    
    if mongo_result.get("success"):
        logger.info(f"Using MongoDB credentials for wallet={wallet}")
        return {
            "success": True,
            "message": mongo_result.get("message", ""),
            "creds": mongo_result.get("creds"),
            "is_creator": is_creator,
            "creator_wallet": creator_wallet,
        }
    
    # MongoDB failed - try PostgreSQL if creator
    if is_creator:
        logger.info(f"MongoDB failed, falling back to PostgreSQL for creator worker_id={worker_id}")
        pg_result = get_google_credentials_from_postgres(worker_id)
        
        return {
            "success": pg_result.get("success", False),
            "message": pg_result.get("message", ""),
            "creds": pg_result.get("creds"),
            "is_creator": True,
            "creator_wallet": creator_wallet,
        }
    
    # Both failed
    logger.warning(f"[get_credentials_unified] Both MongoDB and PostgreSQL failed for wallet={wallet}")
    return {
        "success": False,
        "message": mongo_result.get("message", "No credentials found"),
        "creds": None,
        "is_creator": is_creator,
        "creator_wallet": creator_wallet,
    }


def check_send_permission(
    wallet: str,
    worker_id: str,
    receiver_email: str
) -> Dict[str, Any]:
    """
    Check if the user has permission to perform write operations (create/update/cancel events).
    
    Rules:
    - If wallet == creator_wallet: FULL ACCESS
    - If wallet != creator_wallet: Can ONLY send invites to creator's email
    
    Returns:
    {
        "allowed": bool,
        "is_creator": bool,
        "message": str
    }
    """
    return validate_send_access(wallet, worker_id, receiver_email, users_collection)


def check_read_permission(wallet: str, worker_id: str) -> Dict[str, Any]:
    """
    Check if the user has permission for read-only operations.
    
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
    return validate_read_only_access(wallet, worker_id)