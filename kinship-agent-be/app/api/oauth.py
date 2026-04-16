"""
Kinship Agent - OAuth API

Handles complete OAuth flow for Google, LinkedIn, Facebook.
Frontend just redirects to backend - no OAuth code in frontend.

Endpoints:
- GET /api/oauth/{provider}/init - Initiates OAuth flow (redirects to provider)
- GET /api/oauth/{provider}/callback - Handles callback, saves to DB if agentId provided

CHANGES:
- agentId is now OPTIONAL - allows OAuth during agent creation (before agent exists)
- If agentId is provided: save to tool_connections DB
- If agentId is missing: just return tokens via postMessage (for agent creation flow)
- Credentials always returned via postMessage for frontend to use
"""

import json
import base64
from datetime import datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from nanoid import generate as nanoid

from app.db.database import get_session
from app.db.models import Agent, ToolConnection
from app.core.config import settings
from app.services.tools import encrypt_credentials_dict, decrypt_credentials_dict

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

# Google tools to be stored as array instead of single "google"
GOOGLE_TOOLS = ["google_gmail_tool", "google_calendar_tool", "google_meet_tool"]

# ─────────────────────────────────────────────────────────────────────────────
# OAuth Configuration
# ─────────────────────────────────────────────────────────────────────────────

OAUTH_CONFIG = {
    "google": {
        "auth_url": "https://accounts.google.com/o/oauth2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": [
            # User info
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            # Gmail - full functionality (read, send, modify labels)
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            # Calendar - full functionality (read, create, update, delete events)
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events",
            # Drive - for attachment downloads and Meet artifact linking
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.file",
        ],
        "extra_params": {
            "access_type": "offline",
            "prompt": "consent",
        },
    },
    "linkedin": {
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "userinfo_url": "https://api.linkedin.com/v2/userinfo",
        "scopes": ["openid", "profile", "email", "w_member_social"],
        "extra_params": {},
    },
    "facebook": {
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "userinfo_url": "https://graph.facebook.com/me?fields=id,name,email",
        "scopes": ["email", "public_profile", "pages_show_list", "pages_manage_posts"],
        "extra_params": {},
    },
}


def get_oauth_credentials(provider: str) -> tuple[str, str]:
    """Get OAuth client ID and secret from settings."""
    credential_map = {
        "google": (settings.google_client_id, settings.google_client_secret),
        "linkedin": (settings.linkedin_client_id, settings.linkedin_client_secret),
        "facebook": (settings.facebook_client_id, settings.facebook_client_secret),
    }
    return credential_map.get(provider, ("", ""))


def get_frontend_url() -> str:
    """Get frontend URL from settings."""
    return settings.frontend_url


def get_backend_url() -> str:
    """Get backend URL from settings."""
    return settings.backend_url


# ─────────────────────────────────────────────────────────────────────────────
# OAuth Initiate
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{provider}/init")
async def oauth_init(
    provider: str,
    agentId: str = Query(None),  # OPTIONAL - allows OAuth during agent creation
    platformId: str = Query(None),
    popup: bool = Query(False),
):
    """
    Initiate OAuth flow - redirects to provider's auth page.

    Query params:
    - agentId: Worker agent ID (OPTIONAL - if not provided, tokens returned without saving to DB)
    - platformId: Platform ID (optional)
    - popup: Whether this is a popup window (optional)
    """
    if provider not in OAUTH_CONFIG:
        return HTMLResponse(
            content=get_error_html(provider, f"Unknown provider: {provider}"),
            status_code=400,
        )

    client_id, client_secret = get_oauth_credentials(provider)
    if not client_id or not client_secret:
        return HTMLResponse(
            content=get_error_html(provider, f"OAuth not configured for {provider}"),
            status_code=500,
        )

    config = OAUTH_CONFIG[provider]
    backend_url = get_backend_url()
    redirect_uri = f"{backend_url}/api/oauth/{provider}/callback"

    # Encode state with agent info (agentId may be None)
    state_data = {
        "agentId": agentId,
        "platformId": platformId,
        "popup": popup,
    }
    state = base64.b64encode(json.dumps(state_data).encode()).decode()

    # Build authorization URL
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state,
        **config.get("extra_params", {}),
    }

    auth_url = f"{config['auth_url']}?{urlencode(params)}"
    print(f"[OAuth] Redirecting to {provider} auth (agentId={agentId})")

    return RedirectResponse(url=auth_url)


# ─────────────────────────────────────────────────────────────────────────────
# OAuth Callback
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """
    Handle OAuth callback - exchanges code for tokens.

    If agentId is provided: saves to tool_connections DB
    If agentId is missing: just returns tokens via postMessage (for agent creation flow)
    """
    frontend_url = get_frontend_url()

    # Decode state
    state_data = {}
    if state:
        try:
            state_data = json.loads(base64.b64decode(state).decode())
        except Exception:
            pass

    agent_id = state_data.get("agentId")  # May be None
    platform_id = state_data.get("platformId")
    popup = state_data.get("popup", False)

    print(f"[OAuth Callback] provider={provider}, agent_id={agent_id}, popup={popup}")

    # Handle OAuth errors
    if error:
        print(f"[OAuth] Error from provider: {error}")
        if popup:
            return HTMLResponse(content=get_error_html(provider, "OAuth authorization was denied"))
        return RedirectResponse(
            url=f"{frontend_url}/empower?error=oauth_denied&provider={provider}"
        )

    if not code:
        if popup:
            return HTMLResponse(content=get_error_html(provider, "Missing authorization code"))
        return RedirectResponse(url=f"{frontend_url}/empower?error=missing_code")

    if provider not in OAUTH_CONFIG:
        if popup:
            return HTMLResponse(content=get_error_html(provider, "Unknown provider"))
        return RedirectResponse(url=f"{frontend_url}/empower?error=unknown_provider")

    config = OAUTH_CONFIG[provider]
    client_id, client_secret = get_oauth_credentials(provider)

    if not client_id or not client_secret:
        if popup:
            return HTMLResponse(content=get_error_html(provider, "OAuth not configured"))
        return RedirectResponse(url=f"{frontend_url}/empower?error=oauth_not_configured")

    backend_url = get_backend_url()
    redirect_uri = f"{backend_url}/api/oauth/{provider}/callback"

    # ─── Exchange code for tokens ─────────────────────────────────────────────
    try:
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                config["token_url"],
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
            )

            if token_response.status_code != 200:
                print(f"[OAuth] Token exchange failed: {token_response.text}")
                if popup:
                    return HTMLResponse(
                        content=get_error_html(provider, "Failed to exchange token")
                    )
                return RedirectResponse(url=f"{frontend_url}/empower?error=token_exchange_failed")

            token_data = token_response.json()
            print(f"[OAuth] Token exchange successful")
    except Exception as e:
        print(f"[OAuth] Token exchange error: {e}")
        if popup:
            return HTMLResponse(content=get_error_html(provider, "Token exchange error"))
        return RedirectResponse(url=f"{frontend_url}/empower?error=token_exchange_failed")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token", "")
    expires_in = token_data.get("expires_in")
    expires_at = (
        int(datetime.utcnow().timestamp() * 1000 + expires_in * 1000) if expires_in else None
    )

    # ─── Get user info ────────────────────────────────────────────────────────
    user_email = ""
    user_name = ""
    external_user_id = ""

    if config.get("userinfo_url") and access_token:
        try:
            async with httpx.AsyncClient() as client:
                userinfo_response = await client.get(
                    config["userinfo_url"],
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if userinfo_response.status_code == 200:
                    userinfo = userinfo_response.json()
                    user_email = userinfo.get("email", "")
                    user_name = userinfo.get("name") or userinfo.get("given_name", "")
                    external_user_id = userinfo.get("id") or userinfo.get("sub", "")
                    print(f"[OAuth] User info: email={user_email}, name={user_name}")
        except Exception as e:
            print(f"[OAuth] Failed to fetch user info: {e}")

    # ─── Save to database ONLY if agentId is provided ─────────────────────────
    if agent_id:
        try:
            # Get worker agent
            agent_stmt = select(Agent).where(Agent.id == agent_id)
            result = await db.execute(agent_stmt)
            agent = result.scalar_one_or_none()

            if not agent:
                print(f"[OAuth] Agent not found: {agent_id}")
                # Don't fail - just skip DB save
            else:
                worker_agent_name = agent.name

                # Build credentials to store (keyed by provider)
                creds_to_store = {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_at": expires_at,
                    "email": user_email,
                    "name": user_name,
                }

                # Use email directly as external_handle
                external_handle = user_email or user_name or None

                now = datetime.utcnow()

                # Check if connection exists for this worker (one record per worker)
                existing_stmt = select(ToolConnection).where(ToolConnection.worker_id == agent_id)
                result = await db.execute(existing_stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing connection record
                    existing.status = "active"
                    existing.worker_agent_name = worker_agent_name

                    # Add tool to tool_names array (store "google" as single entry, NOT expanded)
                    current_tool_names = list(existing.tool_names or [])
                    if provider not in current_tool_names:
                        current_tool_names.append(provider)
                    existing.tool_names = current_tool_names

                    # Update credentials dict (keyed by provider)
                    current_creds = (
                        decrypt_credentials_dict(existing.credentials_encrypted)
                        if existing.credentials_encrypted
                        else {}
                    )
                    current_creds[provider] = creds_to_store
                    existing.credentials_encrypted = encrypt_credentials_dict(current_creds)

                    # Update external handles dict
                    current_handles = dict(existing.external_handles or {})
                    if external_handle:
                        current_handles[provider] = external_handle
                    existing.external_handles = current_handles

                    # Update external user IDs dict
                    current_user_ids = dict(existing.external_user_ids or {})
                    if external_user_id:
                        current_user_ids[provider] = external_user_id
                    existing.external_user_ids = current_user_ids

                    existing.updated_at = now

                    # Mark mutable fields as modified
                    flag_modified(existing, "tool_names")
                    flag_modified(existing, "external_handles")
                    flag_modified(existing, "external_user_ids")

                    print(f"[OAuth] Updated existing connection for {provider}")
                else:
                    # Create new connection record
                    # tool_connections stores "google" as single entry (NOT expanded)
                    conn_id = f"conn_{nanoid(size=12)}"
                    connection = ToolConnection(
                        id=conn_id,
                        worker_id=agent_id,
                        worker_agent_name=worker_agent_name,
                        tool_names=[provider],
                        credentials_encrypted=encrypt_credentials_dict({provider: creds_to_store}),
                        external_handles={provider: external_handle} if external_handle else {},
                        external_user_ids={provider: external_user_id} if external_user_id else {},
                        status="active",
                        connected_at=now,
                        updated_at=now,
                    )
                    db.add(connection)
                    print(f"[OAuth] Created new connection {conn_id} for {provider}")

                # Update agent's tools array (agents table)
                # For Google: expand to individual Google tools array
                tools_to_add_to_agent = GOOGLE_TOOLS if provider == "google" else [provider]
                current_tools = agent.tools or []
                new_tools = current_tools.copy()
                for t in tools_to_add_to_agent:
                    if t not in new_tools:
                        new_tools.append(t)
                if new_tools != current_tools:
                    agent.tools = new_tools
                    agent.updated_at = now
                    flag_modified(agent, "tools")

                await db.commit()
                print(f"[OAuth] Successfully saved {provider} connection for agent {agent_id}")

        except Exception as e:
            print(f"[OAuth] Database error: {e}")
            await db.rollback()
            # Don't fail completely - still return tokens
    else:
        print(f"[OAuth] No agentId provided - returning tokens without saving to DB")

    # ─── Return success with credentials ──────────────────────────────────────
    credentials = {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresAt": expires_at,
        "email": user_email,
        "name": user_name,
    }

    if popup:
        return HTMLResponse(
            content=get_success_html(provider, credentials, user_email or user_name)
        )

    return RedirectResponse(url=f"{frontend_url}/empower?success=connected&provider={provider}")


# ─────────────────────────────────────────────────────────────────────────────
# HTML Templates
# ─────────────────────────────────────────────────────────────────────────────


def get_success_html(provider: str, credentials: dict, display_name: str) -> str:
    """Generate success HTML for popup mode - includes credentials for parent window."""
    safe_name = display_name.replace("'", "\\'") if display_name else provider
    credentials_json = json.dumps(credentials)

    return f"""<!DOCTYPE html>
<html>
<head>
  <title>Connected!</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white; 
    }}
    .container {{ 
      text-align: center; 
      padding: 32px;
      max-width: 320px;
    }}
    .success-icon {{
      width: 64px;
      height: 64px;
      background: rgba(34, 197, 94, 0.15);
      border: 2px solid rgba(34, 197, 94, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      animation: scaleIn 0.3s ease-out;
    }}
    .success-icon svg {{
      width: 32px;
      height: 32px;
      color: #22c55e;
    }}
    @keyframes scaleIn {{
      from {{ transform: scale(0.5); opacity: 0; }}
      to {{ transform: scale(1); opacity: 1; }}
    }}
    h2 {{ 
      font-size: 20px; 
      font-weight: 600; 
      margin-bottom: 8px;
      color: #fff;
    }}
    .account {{ 
      font-size: 14px; 
      color: rgba(255,255,255,0.7); 
      margin-bottom: 16px;
    }}
    .status {{ 
      font-size: 13px; 
      color: rgba(255,255,255,0.5);
    }}
    .dot {{
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 1s infinite;
    }}
    @keyframes pulse {{
      0%, 100% {{ opacity: 1; }}
      50% {{ opacity: 0.5; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2>Connected!</h2>
    <p class="account">{safe_name}</p>
    <p class="status"><span class="dot"></span>Closing window...</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({{
        type: 'oauth_success',
        provider: '{provider}',
        credentials: {credentials_json},
        displayName: '{safe_name}'
      }}, '*');
    }}
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>"""


def get_error_html(provider: str, error_message: str) -> str:
    """Generate error HTML for popup mode."""
    safe_message = error_message.replace("'", "\\'")
    return f"""<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white; 
    }}
    .container {{ 
      text-align: center; 
      padding: 32px;
      max-width: 320px;
    }}
    .error-icon {{
      width: 64px;
      height: 64px;
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      animation: shake 0.4s ease-out;
    }}
    .error-icon svg {{
      width: 32px;
      height: 32px;
      color: #ef4444;
    }}
    @keyframes shake {{
      0%, 100% {{ transform: translateX(0); }}
      25% {{ transform: translateX(-5px); }}
      75% {{ transform: translateX(5px); }}
    }}
    h2 {{ 
      font-size: 20px; 
      font-weight: 600; 
      margin-bottom: 8px;
      color: #fff;
    }}
    .message {{ 
      font-size: 14px; 
      color: rgba(255,255,255,0.7); 
      margin-bottom: 16px;
      line-height: 1.5;
    }}
    .status {{ 
      font-size: 13px; 
      color: rgba(255,255,255,0.5);
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h2>Connection Failed</h2>
    <p class="message">{safe_message}</p>
    <p class="status">Closing window...</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({{
        type: 'oauth_error',
        provider: '{provider}',
        error: '{safe_message}'
      }}, '*');
    }}
    setTimeout(() => window.close(), 2500);
  </script>
</body>
</html>"""
