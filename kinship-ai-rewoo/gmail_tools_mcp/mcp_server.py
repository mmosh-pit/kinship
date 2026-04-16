"""
PACE AI Chatbot MCP Server

This MCP server provides tools for saving final responses from PACE AI chatbot
to MongoDB database. It follows the latest official MCP documentation.
"""

import asyncio
import base64
import json
import logging
from datetime import datetime, timedelta, timezone
import os
from typing import Optional
from dotenv import load_dotenv
from fastmcp import FastMCP

from email.header import Header
from googleapiclient.discovery import build
import io
from googleapiclient.http import MediaIoBaseUpload
from gmail_utils import (
    has_connected_google_account,
    has_member,
    get_google_credentials_by_wallet,
    find_message_ids_by_text,
    build_raw_message,
    schedule_drive_file_deletion,
    get_credentials_unified,
    check_send_permission,
    check_read_permission,
)


load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GoogleWorkspaceMCPServer:
    """MCP Server implementation for Google Workspace MCP operations."""

    def __init__(self, name: str = "GoogleWorkspace-Server"):
        logger.info(f"🚀 Initializing MCP Server: {name}")
        self.mcp_server = FastMCP(name)
        logger.info("🔧 Registering MCP tools")
        self._register_tools()
        self._add_custom_routes()

    def _register_tools(self):
        """Register MCP tools for Google Workspace MCP operations."""

        @self.mcp_server.tool
        async def google_send_email(
            wallet: str,
            receiver: str,
            subject: str,
            body: str,
            worker_id: str,
            cc: Optional[str] = None,
            bcc: Optional[str] = None,
        ) -> str:
            """
            Send an Email via Gmail (Immediate Send)

            PURPOSE:
            Use this tool when the user explicitly wants to SEND an email immediately
            using their connected Gmail account.

            This tool:
            - Verifies the receiver has an active membership
            - Resolves username/email/wallet → actual email address
            - Sends the email instantly via Gmail API (not a draft)

            WHEN TO USE THIS TOOL:
            - User says things like:
            • "Send an email to John"
            • "Mail this to ashi@yopmail.com"
            • "Email the update now"
            • "Notify him via email"
            • "Send this message"

            WHEN NOT TO USE:
            - If the user asks to *draft*, *write*, or *prepare* an email without sending
            → use `google_draft_emails` instead.

            PARAMETERS:
            - wallet (string, required):
                Internal user identifier used to fetch Gmail OAuth credentials.

            - receiver (string, required):
                Email address OR username OR wallet address of the recipient.
                The system will resolve this to a valid email internally.

            - subject (string, required):
                Subject line of the email.

            - body (string, required):
                Plain-text email body content.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            - cc (string, optional):
                Comma-separated CC email addresses.

            - bcc (string, optional):
                Comma-separated BCC email addresses.

            RETURNS:
            JSON object with:
            - success (boolean)
            - message (string)
            - id (string): Gmail message ID if sent successfully
            """

            logger.info(f"[google_send_email] ========== START ==========")
            logger.info(f"[google_send_email] wallet={wallet}, receiver={receiver}, worker_id={worker_id}")
            
            # Get credentials first to determine if user is creator
            cred_result = get_credentials_unified(wallet, worker_id)
            logger.info(f"[google_send_email] get_credentials_unified result: success={cred_result.get('success')}, is_creator={cred_result.get('is_creator')}, creator_wallet={cred_result.get('creator_wallet')}")

            if not cred_result["success"]:
                logger.warning(f"[google_send_email] Credential fetch failed: {cred_result.get('message')}")
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]
            is_creator = cred_result.get("is_creator", False)

            # Determine email_to based on creator status
            logger.info(f"[google_send_email] is_creator={is_creator}, receiver={receiver}")
            
            if is_creator:
                # Creator: Can send to any registered user with Google connected
                logger.info(f"[google_send_email] Creator path - checking has_member for receiver={receiver}")
                membership_result = has_member(receiver)
                logger.info(f"[google_send_email] has_member result: {membership_result}")
                
                if not membership_result["success"]:
                    logger.warning(f"[google_send_email] has_member failed: {membership_result['message']}")
                    return json.dumps(
                        {
                            "success": False,
                            "message": membership_result["message"],
                        }
                    )

                if not membership_result["has_membership"]:
                    logger.warning(f"[google_send_email] Receiver '{receiver}' is NOT registered in Kinship")
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have account in kinship",
                        }
                    )

                email_to = membership_result.get("email")
                logger.info(f"[google_send_email] Resolved email_to={email_to}")

                if not email_to:
                    logger.warning(f"[google_send_email] Receiver has no email address")
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have a valid email address",
                        }
                    )

                # Check if receiver has connected Google account
                logger.info(f"[google_send_email] Checking has_connected_google_account for receiver={receiver}")
                google_check = has_connected_google_account(receiver)
                logger.info(f"[google_send_email] has_connected_google_account result: {google_check}")

                if not google_check["has_connected_google"]:
                    logger.warning(f"[google_send_email] Receiver '{receiver}' does NOT have connected Google account")
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have connected Google account in Kinship",
                        }
                    )
                
                logger.info(f"[google_send_email] ✅ Creator sending email to: {email_to}")
            else:
                # Non-creator: Must validate receiver is in Kinship and has Google connected
                membership_result = has_member(receiver)

                if not membership_result["success"]:
                    return json.dumps(
                        {
                            "success": False,
                            "message": membership_result["message"],
                        }
                    )

                if not membership_result["has_membership"]:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have account in kinship",
                        }
                    )

                email_to = membership_result.get("email")

                if not email_to:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have a valid email address",
                        }
                    )

                # Check send permission (non-creator can only send to creator's email)
                permission_check = check_send_permission(wallet, worker_id, email_to)

                if not permission_check["allowed"]:
                    return json.dumps(
                        {
                            "success": False,
                            "message": permission_check["message"],
                        }
                    )

                # Check if receiver has connected Google account (checks MongoDB + PostgreSQL)
                google_check = has_connected_google_account(receiver)

                if not google_check["has_connected_google"]:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Receiver does not have connected Google account in Kinship",
                        }
                    )

            service = build("gmail", "v1", credentials=creds)

            to_txt = f"To: {email_to}\r\n"
            to_txt += f"CC: {cc}\r\n" if cc else ""
            to_txt += f"BCC: {bcc}\r\n" if bcc else ""

            message = {
                "raw": base64.urlsafe_b64encode(
                    f"{to_txt}Subject: {subject}\r\n\r\n{body}".encode("utf-8")
                ).decode("utf-8")
            }

            sent_message = (
                service.users().messages().send(userId="me", body=message).execute()
            )

            logger.info("Email sent successfully. ID=%s", sent_message.get("id"))

            return json.dumps(
                {
                    "success": True,
                    "message": "Email sent successfully.",
                    "id": sent_message.get("id"),
                }
            )

        self.google_send_email = google_send_email

        @self.mcp_server.tool
        async def google_read_email(
            wallet: str,
            worker_id: str,
            read_type: Optional[str] = "metadata",
            max_results: Optional[int] = 10,
        ) -> str:
            """
            Read Emails from Gmail Inbox

            PURPOSE:
            Use this tool when the user wants to READ, CHECK, or VIEW emails
            from their Gmail inbox using the connected Google account.

            This tool retrieves recent emails and returns either:
            - basic details (default), or
            - full plain-text email content.

            WHEN TO USE THIS TOOL:
            - User says things like:
            • "Read my emails"
            • "Check my inbox"
            • "Show my latest emails"
            • "What emails do I have?"
            • "Read my last 5 mails"
            • "Open my recent emails"

            WHEN NOT TO USE:
            - If the user wants to SEARCH emails by keyword → use `google_search_email`
            - If the user wants to DOWNLOAD attachments → use `google_download_attachments`
            - If the user wants to SEND or DRAFT an email → use send/draft tools

            PARAMETERS:
            - wallet (string, required):
                Internal user identifier used to fetch Gmail OAuth credentials.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            - read_type (string, optional, default = "metadata"):
                Controls how much email content is returned.
                Allowed values:
                • "metadata" → sender, recipient, subject, date, snippet (FAST, default)
                • "full"     → includes full plain-text email body (SLOWER)

            - max_results (integer, optional, default = 10):
                Maximum number of recent emails to retrieve from the inbox.

            RETURNS:
            JSON object with:
            - success (boolean)
            - count (number of emails returned)
            - read_type ("metadata" or "full")
            - emails (list):
                Each email contains:
                • id
                • threadId
                • from
                • to
                • subject
                • date
                • snippet
                • body (only if read_type = "full")
            """
            print("================== wallet ==================", wallet)
            print("================== worker_id ==================", worker_id)
            print("================== read_type ==================", read_type)
            print("================== max_results ==================", max_results)

            # Check read permission (only creator allowed)
            permission_check = check_read_permission(wallet, worker_id)

            if not permission_check["allowed"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": permission_check["message"],
                    }
                )

            # Get credentials (unified: PostgreSQL for creator, MongoDB for others)
            cred_result = get_credentials_unified(wallet, worker_id)
            print("================== cred_result ==================", cred_result)

            if not cred_result["success"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]
            service = build("gmail", "v1", credentials=creds)

            try:
                results = (
                    service.users()
                    .messages()
                    .list(userId="me", maxResults=max_results)
                    .execute()
                )
            except Exception as e:
                return json.dumps(
                    {
                        "success": False,
                        "message": "Failed to read emails",
                    }
                )

            messages = results.get("messages", [])

            if not messages:
                return json.dumps(
                    {
                        "success": True,
                        "emails": [],
                        "message": "No emails found",
                    }
                )

            emails = []

            for msg in messages:
                msg_id = msg["id"]

                try:
                    msg_data = (
                        service.users()
                        .messages()
                        .get(
                            userId="me",
                            id=msg_id,
                            format="full" if read_type == "full" else "metadata",
                        )
                        .execute()
                    )
                except Exception:
                    continue

                payload = msg_data.get("payload", {})
                headers = payload.get("headers", [])

                def get_header(name: str) -> str:
                    for h in headers:
                        if h.get("name", "").lower() == name.lower():
                            return h.get("value", "")
                    return ""

                email_item = {
                    "id": msg_id,
                    "threadId": msg_data.get("threadId"),
                    "from": get_header("From"),
                    "to": get_header("To"),
                    "subject": get_header("Subject"),
                    "date": get_header("Date"),
                    "snippet": msg_data.get("snippet"),
                }

                if read_type == "full":
                    body_text = ""

                    def extract_body(part):
                        nonlocal body_text
                        if part.get("mimeType") == "text/plain":
                            data = part.get("body", {}).get("data")
                            if data:
                                body_text += base64.urlsafe_b64decode(data).decode(
                                    "utf-8", errors="ignore"
                                )
                        for sub_part in part.get("parts", []):
                            extract_body(sub_part)

                    extract_body(payload)
                    email_item["body"] = body_text.strip()

                emails.append(email_item)

            return json.dumps(
                {
                    "success": True,
                    "count": len(emails),
                    "emails": emails,
                    "read_type": read_type,
                }
            )

        self.google_read_email = google_read_email

        @self.mcp_server.tool
        async def google_search_email(
            wallet: str,
            query: str,
            worker_id: str,
            max_results: int = 10,
        ) -> str:
            """
            Search Emails in Gmail (Keyword / Sender / Subject / Date)

            PURPOSE:
            Use this tool when the user wants to SEARCH or FILTER emails in Gmail
            using keywords, sender names, subjects, or Gmail-style search queries.

            This tool is designed for **targeted email discovery**, not for simply
            reading recent inbox messages.

            WHEN TO USE THIS TOOL:
            - User says things like:
            • "Search emails from Amazon"
            • "Find emails about invoices"
            • "Show mails with subject payment"
            • "Find emails from last week"
            • "Search Gmail for meeting notes"
            • "Find emails containing OTP"

            WHEN NOT TO USE:
            - If the user wants to READ recent emails → use `google_read_email`
            - If the user wants to DOWNLOAD attachments → use `google_download_attachments`
            - If the user wants to SEND / DRAFT → use send or draft tools

            PARAMETERS:
            - wallet (string, required):
                Internal user identifier used to fetch Gmail OAuth credentials.

            - query (string, required):
                Gmail search query using Gmail’s native syntax.
                Examples:
                • "from:amazon"
                • "subject:invoice"
                • "has:attachment"
                • "payment"
                • "from:boss after:2024/01/01"

                This parameter is REQUIRED — without it, searching is not possible.

            - max_results (integer, optional, default = 10):
                Maximum number of matching emails to return.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            RETURNS:
            JSON object with:
            - success (boolean)
            - count (number of matching emails)
            - emails (list):
                Each email contains:
                • id
                • threadId
                • from
                • to
                • subject
                • date
                • snippet
            """

            # Check read permission (only creator allowed)
            permission_check = check_read_permission(wallet, worker_id)

            if not permission_check["allowed"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": permission_check["message"],
                    }
                )

            # Get credentials (unified: PostgreSQL for creator, MongoDB for others)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]

            service = build("gmail", "v1", credentials=creds)

            try:
                response = (
                    service.users()
                    .messages()
                    .list(
                        userId="me",
                        q=query,
                        maxResults=max_results,
                    )
                    .execute()
                )
            except Exception as e:
                return json.dumps(
                    {
                        "success": False,
                        "message": "Failed to search emails",
                    }
                )

            messages = response.get("messages", [])

            if not messages:
                return json.dumps(
                    {
                        "success": True,
                        "count": 0,
                        "emails": [],
                        "message": "No emails found",
                    }
                )

            results = []

            for msg in messages:
                try:
                    msg_data = (
                        service.users()
                        .messages()
                        .get(
                            userId="me",
                            id=msg["id"],
                            format="metadata",
                            metadataHeaders=["From", "To", "Subject", "Date"],
                        )
                        .execute()
                    )

                    headers = {
                        h["name"]: h["value"]
                        for h in msg_data.get("payload", {}).get("headers", [])
                    }

                    results.append(
                        {
                            "id": msg_data.get("id"),
                            "threadId": msg_data.get("threadId"),
                            "from": headers.get("From"),
                            "to": headers.get("To"),
                            "subject": headers.get("Subject"),
                            "date": headers.get("Date"),
                            "snippet": msg_data.get("snippet"),
                        }
                    )

                except Exception:
                    continue

            return json.dumps(
                {
                    "success": True,
                    "count": len(results),
                    "emails": results,
                }
            )

        self.google_search_email = google_search_email

        @self.mcp_server.tool
        async def google_draft_emails(
            wallet: str,
            receiver: str,
            subject: str,
            body: str,
            worker_id: str,
            cc: Optional[str] = None,
            bcc: Optional[str] = None,
        ) -> str:
            """
            Draft an Email in Gmail (Save Draft Only – Do NOT Send)

            PURPOSE:
            This tool creates an email **draft inside the user’s Gmail account**.
            The email is saved as a draft and is NOT sent.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Draft an email"
            - "Create an email draft"
            - "Save this as a Gmail draft"
            - "Prepare a draft mail"
            - "Write an email but don’t send it"
            - "Draft a message to someone"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to SEND the email → use `google_send_email`
            - The user wants to READ emails → use `google_read_email`
            - The user wants to SEARCH emails → use `google_search_email`

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user intent is to CREATE A DRAFT, the assistant MUST call this tool.
            - The assistant MUST NOT generate a free-form email as chat output
            when drafting is requested.
            - The assistant should only ask follow-up questions if REQUIRED fields
            are missing.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to access Gmail OAuth credentials.

            - receiver (string):
                Recipient email address.
                Example: "ashi@yopmail.com"

            - subject (string):
                Subject line of the email.
                Example: "Trip Cancellation"

            - body (string):
                Full plain-text body of the email.
                Example:
                "Hi,
                My trip scheduled for tomorrow has been cancelled.
                Regards"

            OPTIONAL PARAMETERS:
            - cc (string, optional):
                Comma-separated list of CC email addresses.

            - bcc (string, optional):
                Comma-separated list of BCC email addresses.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            IF REQUIRED INFORMATION IS MISSING:
            - Do NOT invent email content.
            - Ask the user clearly for the missing fields:
            (receiver, subject, or body).
            - Once all required values are available, CALL THIS TOOL.

            RETURNS:
            JSON with:
            - success (boolean)
            - message (status message)
            - draft_id (string): Gmail draft identifier
            """

            # Check read permission (only creator allowed to create drafts)
            permission_check = check_read_permission(wallet, worker_id)

            if not permission_check["allowed"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": permission_check["message"],
                    }
                )

            # Get credentials (unified: PostgreSQL for creator, MongoDB for others)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]

            service = build("gmail", "v1", credentials=creds)

            headers = f"To: {receiver}\r\n"
            headers += f"CC: {cc}\r\n" if cc else ""
            headers += f"BCC: {bcc}\r\n" if bcc else ""
            headers += "MIME-Version: 1.0\r\n"
            headers += 'Content-Type: text/plain; charset="UTF-8"\r\n'
            headers += "Content-Transfer-Encoding: 8bit\r\n"

            encoded_subject = Header(subject, "utf-8").encode()
            headers += f"Subject: {encoded_subject}\r\n\r\n"

            raw_message = base64.urlsafe_b64encode(
                f"{headers}{body}".encode("utf-8")
            ).decode("utf-8")

            draft_body = {"message": {"raw": raw_message}}

            draft = (
                service.users().drafts().create(userId="me", body=draft_body).execute()
            )

            logger.info("Draft created successfully. ID=%s", draft.get("id"))

            return json.dumps(
                {
                    "success": True,
                    "message": "Email drafted successfully",
                    "draft_id": draft.get("id"),
                }
            )

        self.google_draft_emails = google_draft_emails

        @self.mcp_server.tool
        async def google_reply_forward_email(
            wallet: str,
            action: str,  # "reply" | "forward"
            body: str,
            worker_id: str,
            to: Optional[str] = None,  # required for forward
            message_id: Optional[str] = None,
            search_text: Optional[str] = None,  # used when message_id is missing
        ) -> str:
            """
            Reply to an Email or Forward an Email in Gmail (Send Immediately)

            PURPOSE:
            This tool is used to **reply to an existing Gmail message** or
            **forward an existing Gmail message to another recipient**.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Reply to this email"
            - "Respond to the email"
            - "Send a reply saying …"
            - "Forward this email"
            - "Forward the message to someone"
            - "Reply back to them"
            - "Send a response to the email"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to CREATE A NEW EMAIL → use `google_send_email`
            - The user wants to SAVE A DRAFT → use `google_draft_emails`
            - The user wants to READ emails → use `google_read_email`
            - The user wants to SEARCH emails → use `google_search_email`

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user intent is to REPLY or FORWARD an existing email,
            the assistant MUST call this tool.
            - The assistant MUST NOT generate a free-form reply in chat.
            - The email MUST be sent via Gmail using this tool.
            - If the target email cannot be uniquely identified,
            ask the user for clarification before proceeding.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to access Gmail OAuth credentials.

            - action (string):
                Must be one of:
                - "reply"   → replies to the original sender
                - "forward" → forwards the email to another recipient

            - body (string):
                The reply or forward message body (plain text).
                Example:
                "Thanks for the update. I’ll review and get back to you."

            OPTIONAL / CONDITIONAL PARAMETERS:
            - to (string, required ONLY for action="forward"):
                Recipient email address to forward the message to.
                Example: "ashi@yopmail.com"

            - message_id (string, optional):
                Gmail message ID of the email to reply/forward.
                Use this when the email is already known.

            - search_text (string, optional):
                Text used to locate the email (subject/body/sender)
                when message_id is not provided.
                Example: "Trip confirmation email"

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            EMAIL RESOLUTION RULES:
            - If message_id is provided → use it directly.
            - If message_id is NOT provided → search using search_text.
            - If multiple emails match → ASK the user to confirm.
            - If no emails match → return a clear error message.

            RETURNS:
            JSON with:
            - success (boolean)
            - message (status message)
            - id (string): Sent Gmail message ID
            - threadId (string): Gmail thread ID
            """

            logger.info("ACTION=%s wallet=%s", action, wallet)

            if action not in ("reply", "forward"):
                return json.dumps(
                    {
                        "success": False,
                        "message": "Invalid action. Use 'reply' or 'forward'.",
                    }
                )

            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]
            is_creator = cred_result.get("is_creator", False)
            service = build("gmail", "v1", credentials=creds)

            if not message_id:
                if not search_text:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Either message_id or search_text is required",
                        }
                    )

                search_result = find_message_ids_by_text(service, search_text)

                if not search_result["success"]:
                    return json.dumps(search_result)

                matches = search_result["matches"]

                if not matches:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "No messages found matching the given text",
                        }
                    )

                if len(matches) > 1:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Multiple messages found. Please confirm which one to use.",
                            "candidates": matches,
                        }
                    )

                message_id = matches[0]["id"]

            original = (
                service.users()
                .messages()
                .get(userId="me", id=message_id, format="metadata")
                .execute()
            )

            headers = {
                h["name"].lower(): h["value"] for h in original["payload"]["headers"]
            }

            subject = headers.get("subject", "")
            from_email = headers.get("from", "")

            if action == "reply":
                # Extract email from "Name <email@domain.com>" format
                sender_email = from_email.split("<")[-1].replace(">", "").strip()
                
                if is_creator:
                    # Creator: Can reply to any registered user with Google connected
                    membership_result = has_member(sender_email)
                    
                    if not membership_result["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": membership_result["message"],
                            }
                        )

                    if not membership_result["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have an account in Kinship",
                            }
                        )

                    email_to = membership_result.get("email")

                    if not email_to:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have a valid email address",
                            }
                        )

                    # Check if sender has connected Google account
                    google_check = has_connected_google_account(sender_email)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have connected Google account in Kinship",
                            }
                        )

                    logger.info("Creator replying to: %s", email_to)
                else:
                    # Non-creator: Must validate sender is in Kinship
                    membership_result = has_member(sender_email)
                    if not membership_result["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": membership_result["message"],
                            }
                        )

                    if not membership_result["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have an account in Kinship",
                            }
                        )

                    email_to = membership_result.get("email")

                    if not email_to:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have a valid email address",
                            }
                        )

                    # Check send permission for reply
                    permission_check = check_send_permission(wallet, worker_id, email_to)

                    if not permission_check["allowed"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": permission_check["message"],
                            }
                        )

                    # Check if sender has connected Google account (checks MongoDB + PostgreSQL)
                    google_check = has_connected_google_account(sender_email)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Sender does not have connected Google account in Kinship",
                            }
                        )

                reply_subject = subject
                if not subject.lower().startswith("re:"):
                    reply_subject = f"Re: {subject}"

                raw_message = build_raw_message(
                    to=from_email,
                    subject=reply_subject,
                    body=body,
                )

                raw_message["threadId"] = original["threadId"]

            else:
                if not to:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Recipient email is required for forwarding",
                        }
                    )

                if is_creator:
                    # Creator: Can forward to any registered user with Google connected
                    membership_result = has_member(to)
                    
                    if not membership_result["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": membership_result["message"],
                            }
                        )

                    if not membership_result["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have an account in Kinship",
                            }
                        )

                    email_to = membership_result.get("email")

                    if not email_to:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have a valid email address",
                            }
                        )

                    # Check if receiver has connected Google account
                    google_check = has_connected_google_account(to)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have connected Google account in Kinship",
                            }
                        )

                    logger.info("Creator forwarding to: %s", email_to)
                else:
                    # Non-creator: Must validate receiver is in Kinship
                    membership_result = has_member(to)

                    if not membership_result["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": membership_result["message"],
                            }
                        )

                    if not membership_result["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have an account in Kinship",
                            }
                        )

                    email_to = membership_result.get("email")

                    if not email_to:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have a valid email address",
                            }
                        )

                    # Check send permission for forward
                    permission_check = check_send_permission(wallet, worker_id, email_to)

                    if not permission_check["allowed"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": permission_check["message"],
                            }
                        )

                    # Check if receiver has connected Google account (checks MongoDB + PostgreSQL)
                    google_check = has_connected_google_account(to)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Receiver does not have connected Google account in Kinship",
                            }
                        )

                forward_subject = subject
                if not subject.lower().startswith("fwd:"):
                    forward_subject = f"Fwd: {subject}"

                raw_message = build_raw_message(
                    to=email_to,
                    subject=forward_subject,
                    body=body,
                )

            sent = (
                service.users().messages().send(userId="me", body=raw_message).execute()
            )

            logger.info("Email %s sent. ID=%s", action, sent.get("id"))

            return json.dumps(
                {
                    "success": True,
                    "message": f"Email {action} sent successfully",
                    "id": sent.get("id"),
                    "threadId": sent.get("threadId"),
                }
            )

        self.google_reply_forward_email = google_reply_forward_email

        @self.mcp_server.tool
        async def google_manage_labels(
            wallet: str,
            action: str,  # "add" | "remove" | "list" | "create"
            worker_id: str,
            label_name: Optional[str] = None,
            message_id: Optional[str] = None,
            search_text: Optional[str] = None,
            auto_create: bool = True,
        ) -> str:
            """
            Add, Remove, List, or Create Gmail Labels on Emails

            PURPOSE:
            This tool manages **Gmail labels** on one or more emails.
            It can:
            - Add a label to an email
            - Remove a label from an email
            - List all Gmail labels
            - Create a new custom label

            USE THIS TOOL WHEN THE USER SAYS:
            - "Add a label to this email"
            - "Remove the label from this email"
            - "Delete / remove label XYZ"
            - "Tag this email as Important"
            - "Apply label Finance to the message"
            - "Remove label TN from the email"
            - "Show me all my labels"
            - "Create a new label called Invoices"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to READ emails → use `google_read_email`
            - The user wants to SEARCH emails → use `google_search_email`
            - The user wants to SEND or DRAFT an email

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user intent involves **labels**, the assistant MUST call this tool.
            - The assistant MUST NOT respond with a chat-only explanation.
            - If the target email cannot be uniquely identified,
            the assistant MUST ask the user for clarification.
            - If a label removal is requested and the label is already removed,
            the tool MUST still return a success message.

            ACTIONS (action parameter):
            - "add"    → Apply a label to an email
            - "remove" → Remove a label from an email
            - "list"   → List all Gmail labels (system + custom)
            - "create" → Create a new custom label in Gmail

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to access Gmail OAuth credentials.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            CONDITIONAL PARAMETERS:
            - label_name (string):
                Required for actions: "add", "remove", "create"
                Example: "Finance", "TN", "Invoices"

            EMAIL IDENTIFICATION (one is required for add/remove):
            - message_id (string, optional):
                Gmail message ID to modify directly.

            - search_text (string, optional):
                Text used to locate the email (subject/body/sender)
                when message_id is not provided.
                Example: "Invoice from Amazon"

            LABEL BEHAVIOR:
            - System labels (Inbox, Starred, Important, etc.) are supported.
            - Custom labels are auto-created if not found (unless auto_create=false).
            - Removing a label that is already absent returns success (idempotent).

            BULK / MULTI-MATCH RULES:
            - If multiple messages match search_text:
                → Ask the user to confirm which one to modify.
            - If no messages match:
                → Return a clear error message.

            RETURNS:
            JSON with:
            - success (boolean)
            - message (human-readable result)
            - message_id (string, when applicable)
            - label_id (string)
            - label_type ("system" | "custom")
            """

            SYSTEM_LABELS = {
                "important": "IMPORTANT",
                "starred": "STARRED",
                "inbox": "INBOX",
                "unread": "UNREAD",
                "sent": "SENT",
                "trash": "TRASH",
                "spam": "SPAM",
                "draft": "DRAFT",
            }

            logger.info(
                "LABEL ACTION=%s wallet=%s LABEL=%s",
                action,
                wallet,
                label_name,
            )

            # Check read permission (only creator allowed)
            permission_check = check_read_permission(wallet, worker_id)

            if not permission_check["allowed"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": permission_check["message"],
                    }
                )

            # Get credentials (unified: PostgreSQL for creator, MongoDB for others)
            cred_result = get_credentials_unified(wallet, worker_id)
            if not cred_result["success"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": cred_result["message"],
                    }
                )

            creds = cred_result["creds"]
            service = build("gmail", "v1", credentials=creds)

            if action == "list":
                labels = (
                    service.users()
                    .labels()
                    .list(userId="me")
                    .execute()
                    .get("labels", [])
                )

                return json.dumps(
                    {
                        "success": True,
                        "count": len(labels),
                        "labels": [
                            {
                                "id": l["id"],
                                "name": l["name"],
                                "type": l["type"],  # system | user
                            }
                            for l in labels
                        ],
                    }
                )

            if action == "create":
                if not label_name:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "label_name is required to create label",
                        }
                    )

                label = (
                    service.users()
                    .labels()
                    .create(
                        userId="me",
                        body={
                            "name": label_name,
                            "labelListVisibility": "labelShow",
                            "messageListVisibility": "show",
                        },
                    )
                    .execute()
                )

                return json.dumps(
                    {
                        "success": True,
                        "message": "Custom label created successfully",
                        "label": {
                            "id": label["id"],
                            "name": label["name"],
                        },
                    }
                )

            if action not in ("add", "remove"):
                return json.dumps(
                    {
                        "success": False,
                        "message": "Invalid action. Use add, remove, list, or create.",
                    }
                )

            if not label_name:
                return json.dumps(
                    {
                        "success": False,
                        "message": "label_name is required",
                    }
                )

            label_key = label_name.lower()

            if label_key in SYSTEM_LABELS:
                label_id = SYSTEM_LABELS[label_key]
                label_type = "system"
            else:
                labels = (
                    service.users()
                    .labels()
                    .list(userId="me")
                    .execute()
                    .get("labels", [])
                )

                label_id = next(
                    (l["id"] for l in labels if l["name"].lower() == label_key),
                    None,
                )

                if not label_id:
                    if not auto_create:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Label '{label_name}' not found",
                            }
                        )

                    label = (
                        service.users()
                        .labels()
                        .create(
                            userId="me",
                            body={
                                "name": label_name,
                                "labelListVisibility": "labelShow",
                                "messageListVisibility": "show",
                            },
                        )
                        .execute()
                    )

                    label_id = label["id"]

                label_type = "custom"

            if not message_id:
                if not search_text:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Either message_id or search_text is required",
                        }
                    )

                search_result = find_message_ids_by_text(service, search_text)

                if not search_result["success"]:
                    return json.dumps(search_result)

                matches = search_result["matches"]

                if not matches:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "No matching messages found",
                        }
                    )

                if len(matches) > 1:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Multiple messages found. Please confirm which one to use.",
                            "candidates": matches,
                        }
                    )

                message_id = matches[0]["id"]

            message = (
                service.users()
                .messages()
                .get(
                    userId="me",
                    id=message_id,
                    format="metadata",
                    metadataHeaders=["LabelIds"],
                )
                .execute()
            )

            existing_label_ids = set(message.get("labelIds", []))

            if action == "remove" and label_id not in existing_label_ids:
                return json.dumps(
                    {
                        "success": True,
                        "message": f"Label '{label_name}' was already removed from the message",
                        "message_id": message_id,
                        "label_id": label_id,
                        "label_type": label_type,
                    }
                )

            modify_body = (
                {"addLabelIds": [label_id]}
                if action == "add"
                else {"removeLabelIds": [label_id]}
            )

            service.users().messages().modify(
                userId="me",
                id=message_id,
                body=modify_body,
            ).execute()

            return json.dumps(
                {
                    "success": True,
                    "message": f"{label_type.capitalize()} label '{label_name}' {action}ed successfully",
                    "message_id": message_id,
                    "label_id": label_id,
                    "label_type": label_type,
                }
            )

        self.google_manage_labels = google_manage_labels

        @self.mcp_server.tool
        async def google_download_attachments(
            wallet: str,
            worker_id: str,
            message_id: Optional[str] = None,
            search_text: Optional[str] = None,
            save_to_drive: bool = False,
            drive_folder_name: Optional[str] = "Email Attachments",
        ) -> str:
            """
            Download Email Attachments from Gmail (with Optional Google Drive Links)

            PURPOSE:
            This tool retrieves **file attachments from Gmail emails** and provides
            **downloadable access** to them.
            Attachments can either:
            - Be returned as temporary Google Drive download links, OR
            - Be permanently saved to the user’s Google Drive.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Download the attachment"
            - "Get the file from the email"
            - "Download the invoice / PDF / image from my mail"
            - "Save the attachment to Drive"
            - "Give me the attachment from that email"
            - "Fetch the attachment sent by John"
            - "Download all attachments from this email"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to READ email content → use `google_read_email`
            - The user wants to SEARCH emails → use `google_search_email`
            - The user wants to SEND or DRAFT emails

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user intent involves **attachments or files**, the assistant MUST call this tool.
            - The assistant MUST NOT explain how to download attachments in chat.
            - If multiple emails match, the assistant MUST ask the user to confirm.
            - If no attachments exist, return a clear success message stating that.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to access Gmail OAuth credentials.

            - worker_id (string, required):
                Worker agent ID for access control validation and fetch google credionals.

            EMAIL IDENTIFICATION (ONE IS REQUIRED):
            - message_id (string, optional):
                Exact Gmail message ID to extract attachments from.

            - search_text (string, optional):
                Used to locate the email when message_id is unknown.
                Can match subject, sender, or body text.
                Example:
                "Invoice from Amazon"
                "Email from finance team"

            ATTACHMENT HANDLING OPTIONS:
            - save_to_drive (boolean, default: false):
                false → Attachments are uploaded to Drive temporarily and auto-deleted
                true  → Attachments are saved permanently to Google Drive

            - drive_folder_name (string, optional):
                Google Drive folder name used when saving attachments
                Default: "Email Attachments"

            AUTO-EXPIRY BEHAVIOR:
            - When save_to_drive = false:
                → A public Drive link is created
                → The file is automatically deleted after a short TTL
            - When save_to_drive = true:
                → File remains in Drive permanently
                → No auto-deletion occurs

            FILE TYPES SUPPORTED:
            - PDFs
            - Images (PNG, JPG)
            - Audio / Video
            - Text files
            - Any Gmail-supported attachment type

            RETURNS:
            JSON with:
            - success (boolean)
            - message (summary)
            - attachments[]:
                - filename
                - mimeType
                - size / size_human
                - download_method ("drive_link" | "base64_data")
                - download_link (if Drive-based)
                - expires_in_seconds (if temporary)
                - drive_file_id (if applicable)
            - drive_folder_id (if Drive used)
            - drive_folder_link (if Drive used)
            """

            logger.info(
                "DOWNLOAD ATTACHMENTS: wallet=%s MESSAGE_ID=%s SAVE_TO_DRIVE=%s",
                wallet,
                message_id,
                save_to_drive,
            )

            # Check read permission (only creator allowed)
            permission_check = check_read_permission(wallet, worker_id)

            if not permission_check["allowed"]:
                return json.dumps(
                    {
                        "success": False,
                        "message": permission_check["message"],
                    }
                )

            # Get credentials (unified: PostgreSQL for creator, MongoDB for others)
            cred_result = get_credentials_unified(wallet, worker_id)
            if not cred_result["success"]:
                return json.dumps({"success": False, "message": cred_result["message"]})

            creds = cred_result["creds"]
            gmail_service = build("gmail", "v1", credentials=creds)

            if not message_id:
                if not search_text:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Either message_id or search_text is required",
                        }
                    )

                search_result = find_message_ids_by_text(gmail_service, search_text)
                if not search_result["success"]:
                    return json.dumps(search_result)

                matches = search_result["matches"]
                if not matches:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "No messages found matching the given text",
                        }
                    )

                if len(matches) > 1:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Multiple messages found. Please specify message_id.",
                            "candidates": matches,
                        }
                    )

                message_id = matches[0]["id"]

            message = (
                gmail_service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )

            attachments = []

            def process_parts(parts):
                for part in parts:
                    if part.get("filename") and part.get("body", {}).get(
                        "attachmentId"
                    ):
                        attachments.append(
                            {
                                "filename": part["filename"],
                                "mimeType": part.get(
                                    "mimeType", "application/octet-stream"
                                ),
                                "size": part["body"].get("size", 0),
                                "attachmentId": part["body"]["attachmentId"],
                            }
                        )
                    if "parts" in part:
                        process_parts(part["parts"])

            payload = message.get("payload", {})
            if "parts" in payload:
                process_parts(payload["parts"])

            if not attachments:
                return json.dumps(
                    {
                        "success": True,
                        "message": "No attachments found",
                        "attachments": [],
                    }
                )

            drive_service = None
            drive_folder_id = None

            def ensure_drive():
                nonlocal drive_service, drive_folder_id
                if drive_service and drive_folder_id:
                    return

                drive_service = build("drive", "v3", credentials=creds)

                q = (
                    f"name='{drive_folder_name}' "
                    "and mimeType='application/vnd.google-apps.folder' "
                    "and trashed=false"
                )

                folders = (
                    drive_service.files()
                    .list(q=q, spaces="drive", fields="files(id)")
                    .execute()
                    .get("files", [])
                )

                if folders:
                    drive_folder_id = folders[0]["id"]
                else:
                    folder = (
                        drive_service.files()
                        .create(
                            body={
                                "name": drive_folder_name,
                                "mimeType": "application/vnd.google-apps.folder",
                            },
                            fields="id",
                        )
                        .execute()
                    )
                    drive_folder_id = folder["id"]

            results = []
            # LINK_TTL_SECONDS = 60 * 60  # 1 hour
            LINK_TTL_SECONDS = 60

            for attachment in attachments:
                try:
                    att = (
                        gmail_service.users()
                        .messages()
                        .attachments()
                        .get(
                            userId="me",
                            messageId=message_id,
                            id=attachment["attachmentId"],
                        )
                        .execute()
                    )

                    file_data = base64.urlsafe_b64decode(att["data"])
                    size = attachment["size"]
                    mime = attachment["mimeType"]

                    is_large = size > 200 * 1024
                    is_binary = mime.startswith(
                        ("image/", "video/", "audio/", "application/pdf")
                    )

                    result = {
                        "filename": attachment["filename"],
                        "mimeType": mime,
                        "size": size,
                        "size_human": (
                            f"{size / 1024:.2f} KB"
                            if size < 1024 * 1024
                            else f"{size / (1024 * 1024):.2f} MB"
                        ),
                    }

                    if is_large or is_binary or save_to_drive:
                        ensure_drive()

                        media = MediaIoBaseUpload(
                            io.BytesIO(file_data),
                            mimetype=mime,
                            resumable=True,
                        )

                        file = (
                            drive_service.files()
                            .create(
                                body={
                                    "name": attachment["filename"],
                                    "parents": [drive_folder_id],
                                },
                                media_body=media,
                                fields="id, webViewLink",
                            )
                            .execute()
                        )

                        drive_service.permissions().create(
                            fileId=file["id"],
                            body={"type": "anyone", "role": "reader"},
                        ).execute()

                        if not save_to_drive:
                            asyncio.create_task(
                                schedule_drive_file_deletion(
                                    drive_service,
                                    file["id"],
                                    LINK_TTL_SECONDS,
                                )
                            )

                        payload = {
                            "saved_to_drive": True,
                            "download_method": "drive_link",
                            "drive_file_id": file["id"],
                            "view_link": file["webViewLink"],
                            "download_link": f"https://drive.google.com/uc?export=download&id={file['id']}",
                        }

                        if not save_to_drive:
                            payload["expires_in_seconds"] = LINK_TTL_SECONDS

                        result.update(payload)

                    else:
                        result.update(
                            {
                                "saved_to_drive": False,
                                "download_method": "base64_data",
                                "data": base64.b64encode(file_data).decode("utf-8"),
                                "download_note": "Small text file provided inline",
                            }
                        )

                    results.append(result)

                except Exception as e:
                    logger.error(f"Error processing {attachment['filename']}: {e}")
                    results.append(
                        {
                            "filename": attachment["filename"],
                            "success": False,
                            "error": str(e),
                        }
                    )

            return json.dumps(
                {
                    "success": True,
                    "message": f"Successfully processed {len(results)} attachment(s)",
                    "attachments": results,
                    "drive_folder_id": drive_folder_id,
                    "drive_folder_link": (
                        f"https://drive.google.com/drive/folders/{drive_folder_id}"
                        if drive_folder_id
                        else None
                    ),
                }
            )

        self.google_download_attachments = google_download_attachments

    def _add_custom_routes(self):
        """Add custom HTTP routes for health check and server info only."""

        @self.mcp_server.custom_route("/health", methods=["GET"])
        async def health_check(request):
            from starlette.responses import JSONResponse

            response = JSONResponse(
                {
                    "status": "ok",
                    "server": "GoogleWorkspace-Server",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response

        @self.mcp_server.custom_route("/", methods=["GET"])
        async def root(request):
            from starlette.responses import JSONResponse

            response = JSONResponse(
                {
                    "server": "GoogleWorkspace-Server",
                    "status": "running",
                    "description": "MCP server for PACE AI chatbot final response storage",
                    "endpoints": {
                        "health": "/health",
                        "mcp": "/mcp/ (MCP protocol endpoint)",
                    },
                    "tools": [
                        "save_final_response",
                        "mark_checkpoint_complete",
                        "save_checkpoint_attribute",
                    ],
                }
            )
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response

    def run(self):
        """Start the MCP server."""
        self.mcp_server.run(
            transport="http",
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8000")),
            log_level=os.getenv("LOG_LEVEL"),
        )


def main():
    """Main entry point for the Google Workspace MCP server."""
    try:
        server = GoogleWorkspaceMCPServer()
        server.run()
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        exit(1)


if __name__ == "__main__":
    main()
