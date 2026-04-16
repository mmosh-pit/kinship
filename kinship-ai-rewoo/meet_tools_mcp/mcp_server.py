"""
Google Meet MCP Server

This server provides tools for creating and managing Google Meet links.
Meet links are created via Calendar API since Google Meet has no direct API.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
import os
from typing import Optional
from fastmcp import FastMCP
from googleapiclient.discovery import build
from meet_utils import (
    get_google_credentials_by_wallet,
    get_credentials_unified,
    has_connected_google_account,
    has_member,
    check_read_permission,
    check_send_permission,
    users_collection,
)
from postgres_utils import get_creator_email_from_mongodb

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GoogleMeetMCPServer:
    def __init__(self, name="GoogleMeet-Server"):
        self.mcp = FastMCP(name)
        self._register_tools()
        self._routes()

    def _register_tools(self):
        @self.mcp.tool
        async def google_create_instant_meet(
            wallet: str,
            worker_id: str,
            title: Optional[str] = "Instant Meeting",
            duration_minutes: int = 60,
            attendees: Optional[str] = None,
            description: Optional[str] = None,
        ) -> str:
            """
            Create an Instant Google Meet (Meet Now)

            PURPOSE:
            This tool creates an IMMEDIATE Google Meet link by creating a
            Google Calendar event that starts NOW and lasts for a specified duration.
            It is the equivalent of clicking "Meet now" in Google Meet.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Start a meeting now"
            - "Create an instant Google Meet"
            - "Generate a Meet link right now"
            - "Start a call immediately"
            - "Create a quick meeting"
            - "Open a Google Meet"
            - "Start an instant video call"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to schedule a future meeting (use google_create_event)
            - The user wants to update an existing meeting (use google_update_event)
            - The user wants to invite attendees to an existing meeting
            - The user only wants to search or read calendar events

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be used when the intent is to start a meeting immediately.
            - The assistant MUST NOT generate a fake or placeholder Meet link.
            - The assistant MUST NOT reply with plain text saying “Here’s a link”.
            - The Meet link MUST come from Google Calendar via this tool.
            - Attendees (if provided) MUST be membership-verified.
            - If attendees are provided, invitations are automatically sent.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only create meets with the creator as the sole attendee.

            OPTIONAL PARAMETERS:
            - title (string, default: "Instant Meeting"):
                The meeting title shown in Google Calendar and Meet.
                Examples:
                "Quick Sync", "Instant Standup", "Urgent Call"

            - duration_minutes (integer, default: 60):
                How long the meeting should last starting from now.
                Example values:
                15, 30, 45, 60

            - attendees (string, optional):
                Comma-separated list of email addresses to invite.
                All attendees are membership-verified before being added.
                Example:
                "alice@example.com, bob@example.com"

            - description (string, optional):
                Meeting description shown in the calendar event.
                Example:
                "Quick discussion about deployment issue"

            MEETING BEHAVIOR:
            - Start time = current UTC time
            - End time = start time + duration_minutes
            - A Google Meet link is generated automatically
            - If attendees are provided:
                - Calendar invites are sent
                - Meet appears on their calendars
            - If no attendees:
                - Meet is created for immediate use only

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Start a meeting now"
                → create instant Meet → return Meet link
            - "Create a quick call with Alice"
                → create Meet → invite Alice → send invite
            - "Generate a Meet link for 30 minutes"
                → duration_minutes = 30
            - "Start an urgent meeting"
                → default title + instant Meet

            RETURNS:
            JSON with:
            - success (boolean)
            - meet_type: "instant"
            - meet_link (Google Meet URL)
            - event:
                - id
                - title
                - start
                - end
                - htmlLink
                - attendees (if any)
            """
            logger.info(f"[google_create_instant_meet] wallet={wallet}, worker_id={worker_id}")
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            creator_wallet = cred_result.get("creator_wallet")
            
            # Non-creator permission check (check_send_permission logic)
            if not is_creator:
                if not attendees:
                    return json.dumps({
                        "success": False,
                        "message": "Non-creator must include the creator as the only attendee to create meets",
                    })
                
                # Get creator's email to verify they're the only attendee
                creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                
                if not creator_email:
                    return json.dumps({
                        "success": False,
                        "message": "Could not resolve creator's email for validation",
                    })
                
                # Check attendees list - must be exactly the creator's email only
                attendee_list = [e.strip().lower() for e in attendees.split(",") if e.strip()]
                
                if len(attendee_list) != 1:
                    return json.dumps({
                        "success": False,
                        "message": f"Non-creator can only create meets with the creator as the sole attendee. Remove other attendees.",
                    })
                
                if attendee_list[0] != creator_email.lower():
                    return json.dumps({
                        "success": False,
                        "message": f"Non-creator can only create meets with the creator ({creator_email}) as the sole attendee",
                    })
                
                logger.info(f"[google_create_instant_meet] Non-creator creating meet with creator as sole attendee")

            attendee_emails = []
            if attendees:
                for email in [e.strip() for e in attendees.split(",")]:
                    membership_check = has_member(email)

                    if not membership_check["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Failed to verify attendee: {email}",
                            }
                        )

                    if not membership_check["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Attendee {email} does not have account in kinship",
                            }
                        )

                    google_check = has_connected_google_account(email)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Attendee {email} has not connected Google account in Kinship",
                            }
                        )

                    attendee_email = membership_check.get("email")
                    if attendee_email:
                        attendee_emails.append(attendee_email)

            service = build("calendar", "v3", credentials=cred_result["creds"])

            start_time = datetime.now(timezone.utc)
            end_time = start_time + timedelta(minutes=duration_minutes)

            event_body = {
                "summary": title,
                "start": {
                    "dateTime": start_time.isoformat(),
                    "timeZone": "UTC",
                },
                "end": {
                    "dateTime": end_time.isoformat(),
                    "timeZone": "UTC",
                },
                "conferenceData": {
                    "createRequest": {
                        "requestId": f"instant-meet-{int(datetime.now().timestamp())}",
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
            }

            if description:
                event_body["description"] = description

            if attendee_emails:
                event_body["attendees"] = [{"email": e} for e in attendee_emails]

            try:
                event = (
                    service.events()
                    .insert(
                        calendarId="primary",
                        body=event_body,
                        conferenceDataVersion=1,
                        sendUpdates="all" if attendee_emails else "none",
                    )
                    .execute()
                )

                meet_link = event.get("hangoutLink") or event.get(
                    "conferenceData", {}
                ).get("entryPoints", [{}])[0].get("uri")

                return json.dumps(
                    {
                        "success": True,
                        "message": "Instant Meet created successfully",
                        "meet_type": "instant",
                        "meet_link": meet_link,
                        "event": {
                            "id": event.get("id"),
                            "title": event.get("summary"),
                            "start": event.get("start", {}).get("dateTime"),
                            "end": event.get("end", {}).get("dateTime"),
                            "htmlLink": event.get("htmlLink"),
                            "attendees": [
                                a.get("email") for a in event.get("attendees", [])
                            ],
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error creating instant Meet: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_create_instant_meet = google_create_instant_meet

        @self.mcp.tool
        async def google_create_meet_link_for_later(
            wallet: str,
            worker_id: str,
            title: Optional[str] = "Meeting Link",
            attendees: Optional[str] = None,
            description: Optional[str] = None,
        ) -> str:
            """
            Create a Reusable Google Meet Link (For Later Use)

            PURPOSE:
            This tool generates a Google Meet link that can be reused ANYTIME in the future.
            It does NOT schedule a real meeting time.
            Instead, it creates a hidden placeholder calendar event far in the future
            only to obtain a valid, permanent Google Meet link.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Create a Meet link for later"
            - "Generate a reusable Google Meet link"
            - "Give me a Meet link I can use anytime"
            - "Create a meeting link without scheduling"
            - "I just need a Meet link"
            - "Create a permanent Google Meet link"
            - "Create a Meet link to share"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to start a meeting immediately
            → use google_create_instant_meet
            - The user wants to schedule a meeting at a specific date/time
            → use google_create_event
            - The user wants to update or cancel a meeting
            - The user wants to invite attendees to an existing meeting

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be used when the user explicitly wants a Meet link
            without choosing a date or time.
            - The assistant MUST NOT generate a fake or placeholder Meet URL.
            - The Meet link MUST come from Google Calendar via this tool.
            - The assistant MUST NOT say “Here’s a Meet link you can use”
            unless this tool is called successfully.
            - Attendees (if provided) MUST be membership-verified.
            - The generated Meet link can be reused indefinitely.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only create meets with the creator as the sole attendee.

            OPTIONAL PARAMETERS:
            - title (string, default: "Meeting Link"):
                The meeting title shown in Google Calendar.
                This is prefixed internally with "[LINK ONLY]" to indicate
                it is not a real scheduled meeting.
                Examples:
                "Team Sync Link", "Client Call Link", "Daily Standup Link"

            - attendees (string, optional):
                Comma-separated list of email addresses to invite.
                All attendees are membership-verified before being added.
                Invitations are sent automatically if provided.
                Example:
                "alice@example.com, bob@example.com"

            - description (string, optional):
                Optional description added to the placeholder calendar event.
                Useful for explaining how the link should be used.
                Example:
                "Reusable meeting link for weekly check-ins"

            MEETING BEHAVIOR:
            - A placeholder calendar event is created ~10 years in the future
            - The event is marked as non-blocking (transparent)
            - The Meet link generated can be reused anytime
            - The meeting does NOT appear in normal daily calendar views
            - If attendees are provided:
                - Calendar invitations are sent
                - Attendees can join using the same link anytime

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Create a Meet link"
                → reusable Meet link (no schedule)
            - "Give me a Meet link for later"
                → placeholder event + Meet URL
            - "Create a permanent Google Meet link"
                → reusable Meet link
            - "Create a meeting link to share"
                → reusable Meet link

            RETURNS:
            JSON with:
            - success (boolean)
            - meet_type: "link_for_later"
            - meet_link (Google Meet URL)
            - event:
                - id
                - title
                - htmlLink
                - note explaining placeholder behavior
            """
            logger.info(f"[google_create_meet_link_for_later] wallet={wallet}, worker_id={worker_id}")
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            creator_wallet = cred_result.get("creator_wallet")
            
            # Non-creator permission check (check_send_permission logic)
            if not is_creator:
                if not attendees:
                    return json.dumps({
                        "success": False,
                        "message": "Non-creator must include the creator as the only attendee to create meets",
                    })
                
                # Get creator's email to verify they're the only attendee
                creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                
                if not creator_email:
                    return json.dumps({
                        "success": False,
                        "message": "Could not resolve creator's email for validation",
                    })
                
                # Check attendees list - must be exactly the creator's email only
                attendee_list = [e.strip().lower() for e in attendees.split(",") if e.strip()]
                
                if len(attendee_list) != 1:
                    return json.dumps({
                        "success": False,
                        "message": f"Non-creator can only create meets with the creator as the sole attendee. Remove other attendees.",
                    })
                
                if attendee_list[0] != creator_email.lower():
                    return json.dumps({
                        "success": False,
                        "message": f"Non-creator can only create meets with the creator ({creator_email}) as the sole attendee",
                    })
                
                logger.info(f"[google_create_meet_link_for_later] Non-creator creating meet with creator as sole attendee")

            attendee_emails = []
            if attendees:
                for email in [e.strip() for e in attendees.split(",")]:
                    membership_check = has_member(email)

                    if not membership_check["success"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Failed to verify attendee: {email}",
                            }
                        )

                    if not membership_check["has_membership"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Attendee {email} does not have account in kinship",
                            }
                        )

                    google_check = has_connected_google_account(email)

                    if not google_check["has_connected_google"]:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"Attendee {email} has not connected Google account in Kinship",
                            }
                        )

                    attendee_email = membership_check.get("email")
                    if attendee_email:
                        attendee_emails.append(attendee_email)

            service = build("calendar", "v3", credentials=cred_result["creds"])

            # Create event 10 years in future (won't show on normal calendar view)
            start_time = datetime.now(timezone.utc) + timedelta(days=3650)
            end_time = start_time + timedelta(hours=1)

            event_body = {
                "summary": f"[LINK ONLY] {title}",
                "start": {
                    "dateTime": start_time.isoformat(),
                    "timeZone": "UTC",
                },
                "end": {
                    "dateTime": end_time.isoformat(),
                    "timeZone": "UTC",
                },
                "conferenceData": {
                    "createRequest": {
                        "requestId": f"later-meet-{int(datetime.now().timestamp())}",
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
                "description": (f"{description}\n\n" if description else "")
                + "This is a placeholder event to generate a Meet link. The meeting time is not fixed.",
                "transparency": "transparent",
            }

            if attendee_emails:
                event_body["attendees"] = [{"email": e} for e in attendee_emails]

            try:
                event = (
                    service.events()
                    .insert(
                        calendarId="primary",
                        body=event_body,
                        conferenceDataVersion=1,
                        sendUpdates="all" if attendee_emails else "none",
                    )
                    .execute()
                )

                meet_link = event.get("hangoutLink") or event.get(
                    "conferenceData", {}
                ).get("entryPoints", [{}])[0].get("uri")

                return json.dumps(
                    {
                        "success": True,
                        "message": "Meet link for later created successfully",
                        "meet_type": "link_for_later",
                        "meet_link": meet_link,
                        "event": {
                            "id": event.get("id"),
                            "title": event.get("summary"),
                            "htmlLink": event.get("htmlLink"),
                            "note": "This link can be used anytime. The calendar event is a placeholder.",
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error creating Meet link: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_create_meet_link_for_later = google_create_meet_link_for_later

        @self.mcp.tool
        async def google_get_meet_metadata(
            wallet: str,
            worker_id: str,
            event_id: Optional[str] = None,
            meet_link: Optional[str] = None,
        ) -> str:
            """
            Get Google Meet Metadata, Attendees, and Recordings

            PURPOSE:
            This tool retrieves detailed metadata about an EXISTING Google Meet.
            It is used to look up meeting details, attendees, status, and
            any associated Drive artifacts such as recordings or transcripts.

            USE THIS TOOL WHEN THE USER ASKS:
            - "Get meeting details"
            - "Show Meet metadata"
            - "Who attended this meeting?"
            - "Get details of this Google Meet"
            - "Find meeting info from a Meet link"
            - "Check meeting status"
            - "Get Meet recordings or transcripts"
            - "Show details of this Meet"
            - "Fetch Google Meet information"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a Meet link
            → use google_create_instant_meet or google_create_meet_link_for_later
            - The user wants to schedule a meeting
            → use google_create_event
            - The user wants to update or cancel a meeting
            - The user wants to invite attendees

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - The assistant MUST use this tool to fetch real meeting details.
            - The assistant MUST NOT guess, fabricate, or summarize meeting metadata.
            - Either `event_id` OR `meet_link` is required.
            - If both are provided, `event_id` takes priority.
            - If only `meet_link` is provided, the tool will resolve the calendar event internally.
            - This tool can return linked Drive artifacts (recordings, transcripts),
            but does NOT copy or download them.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar + Drive OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Only the creator can get Meet metadata.

            IDENTIFICATION PARAMETERS (ONE IS REQUIRED):
            - event_id (string, optional):
                Google Calendar event ID associated with the meeting.
                Use this when the event ID is already known.

            - meet_link (string, optional):
                Full Google Meet URL (e.g. https://meet.google.com/abc-defg-hij).
                The tool will extract the Meet code and locate the matching calendar event.

            RESOLUTION LOGIC:
            - If `event_id` is provided → fetch event directly
            - If `meet_link` is provided → search calendar for matching Meet code
            - If no matching event is found → return an error
            - If neither is provided → return an error

            WHAT THIS TOOL RETURNS:
            - Meeting metadata:
                - Event ID
                - Title / summary
                - Description
                - Meet link and Meet code
                - Start & end time
                - Status (confirmed / cancelled)
                - Calendar HTML link
                - Conference solution (Google Meet)
            - Attendee list:
                - Email
                - Response status
                - Organizer flag
            - Drive artifacts (if available):
                - Recordings
                - Transcripts
                - Creation time
                - File size
                - View links

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Get details of this Meet link"
                → resolve Meet → return event metadata
            - "Show attendees of this meeting"
                → return attendee list
            - "Do we have a recording for this Meet?"
                → search Drive → return recording links
            - "Get meeting metadata"
                → return full structured details

            RETURNS:
            JSON with:
            - success (boolean)
            - meeting:
                - event_id
                - title
                - description
                - meet_link
                - meet_code
                - start / end
                - status
                - htmlLink
                - attendees[]
                - conference_solution
            - artifacts:
                - count
                - items[] (recordings / transcripts)
                - note explaining Drive linkage
            """
            logger.info(f"[google_get_meet_metadata] wallet={wallet}, worker_id={worker_id}")
            
            # Check read permission (only creator can read Meet metadata)
            permission_check = check_read_permission(wallet, worker_id)
            if not permission_check["allowed"]:
                return json.dumps({
                    "success": False,
                    "message": permission_check["message"],
                })
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })

            service = build("calendar", "v3", credentials=cred_result["creds"])

            try:
                if not event_id and meet_link:
                    meet_code = None
                    if "meet.google.com/" in meet_link:
                        meet_code = meet_link.split("meet.google.com/")[-1].split("?")[
                            0
                        ]

                    if not meet_code:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Invalid Meet link format",
                            }
                        )

                    events_result = (
                        service.events()
                        .list(
                            calendarId="primary",
                            maxResults=50,
                            singleEvents=True,
                        )
                        .execute()
                    )

                    for event in events_result.get("items", []):
                        event_meet_link = event.get("hangoutLink") or event.get(
                            "conferenceData", {}
                        ).get("entryPoints", [{}])[0].get("uri", "")

                        if meet_code in event_meet_link:
                            event_id = event.get("id")
                            break

                    if not event_id:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "No event found with this Meet link",
                            }
                        )

                elif not event_id:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Either event_id or meet_link is required",
                        }
                    )

                event = (
                    service.events()
                    .get(calendarId="primary", eventId=event_id)
                    .execute()
                )

                conference_data = event.get("conferenceData", {})
                meet_link = event.get("hangoutLink") or conference_data.get(
                    "entryPoints", [{}]
                )[0].get("uri")

                drive_service = build("drive", "v3", credentials=cred_result["creds"])

                meet_code = (
                    meet_link.split("meet.google.com/")[-1].split("?")[0]
                    if meet_link
                    else ""
                )

                drive_artifacts = []
                if meet_code:
                    queries = [
                        f"name contains '{event.get('summary', '')}' and mimeType contains 'video'",
                        f"name contains '{meet_code}' and mimeType contains 'video'",
                        f"name contains 'transcript' and name contains '{event.get('summary', '')}'",
                    ]

                    for query in queries:
                        try:
                            results = (
                                drive_service.files()
                                .list(
                                    q=query,
                                    pageSize=10,
                                    fields="files(id, name, mimeType, webViewLink, createdTime, size)",
                                )
                                .execute()
                            )

                            for file in results.get("files", []):
                                drive_artifacts.append(
                                    {
                                        "id": file.get("id"),
                                        "name": file.get("name"),
                                        "type": (
                                            "recording"
                                            if "video" in file.get("mimeType", "")
                                            else "transcript"
                                        ),
                                        "link": file.get("webViewLink"),
                                        "created": file.get("createdTime"),
                                        "size": file.get("size"),
                                    }
                                )
                        except Exception:
                            continue

                return json.dumps(
                    {
                        "success": True,
                        "meeting": {
                            "event_id": event.get("id"),
                            "title": event.get("summary"),
                            "description": event.get("description"),
                            "meet_link": meet_link,
                            "meet_code": meet_code,
                            "start": event.get("start", {}).get("dateTime")
                            or event.get("start", {}).get("date"),
                            "end": event.get("end", {}).get("dateTime")
                            or event.get("end", {}).get("date"),
                            "status": event.get("status"),
                            "htmlLink": event.get("htmlLink"),
                            "attendees": [
                                {
                                    "email": a.get("email"),
                                    "responseStatus": a.get("responseStatus"),
                                    "organizer": a.get("organizer", False),
                                }
                                for a in event.get("attendees", [])
                            ],
                            "conference_solution": conference_data.get(
                                "conferenceSolution", {}
                            ).get("name", "Google Meet"),
                        },
                        "artifacts": {
                            "count": len(drive_artifacts),
                            "items": drive_artifacts,
                            "note": "Artifacts are linked from Google Drive, not copied",
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error getting Meet metadata: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_get_meet_metadata = google_get_meet_metadata

        @self.mcp.tool
        async def google_add_meet_to_event(
            wallet: str,
            worker_id: str,
            event_id: Optional[str] = None,
            event_title: Optional[str] = None,
            calendar_id: str = "primary",
        ) -> str:
            """
            Add Google Meet Link to an Existing Calendar Event

            PURPOSE:
            This tool adds a Google Meet video conferencing link to an
            ALREADY EXISTING Google Calendar event that does not yet
            have a Meet link.

            USE THIS TOOL WHEN THE USER ASKS:
            - "Add a Google Meet to this event"
            - "Attach a Meet link to my calendar event"
            - "Enable Google Meet for this meeting"
            - "Add video call to the event"
            - "Convert this calendar event into a Google Meet"
            - "Add Meet link to the event titled X"
            - "This event doesn’t have a Meet link — add one"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a new event
            → use google_create_event
            - The user wants an instant meeting
            → use google_create_instant_meet
            - The user wants a reusable Meet link
            → use google_create_meet_link_for_later
            - The user wants to update time, title, or attendees
            → use google_update_event
            - The user wants meeting details or recordings
            → use google_get_meet_metadata

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool ONLY adds a Meet link; it does not modify time,
            title, description, or attendees.
            - The assistant MUST NOT create a new event.
            - If the event already has a Meet link, return it without changes.
            - Either `event_id` OR `event_title` is required.
            - If both are provided, `event_id` takes priority.
            - If `event_title` matches multiple events, the assistant must ask
            the user to clarify.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only add Meet to events where the creator is the sole attendee.

            EVENT IDENTIFICATION (ONE IS REQUIRED):
            - event_id (string, optional):
                Exact Google Calendar event ID.
                Use this when the event ID is already known.

            - event_title (string, optional):
                Event title (summary) to search for.
                Used only when event_id is not provided.

            OPTIONAL PARAMETERS:
            - calendar_id (string, default: "primary"):
                Calendar where the event exists.

            RESOLUTION LOGIC:
            - If `event_id` is provided → fetch event directly
            - If `event_title` is provided → search calendar by title
            - If multiple events are found → return candidates and ask for clarification
            - If event already has a Meet link → return existing link
            - Otherwise → attach a new Google Meet link

            WHAT THIS TOOL RETURNS:
            - success status
            - Meet link URL
            - Updated event metadata:
                - Event ID
                - Title
                - Start / end time
                - Calendar HTML link

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Add Meet to my event tomorrow"
                → resolve event → attach Meet link
            - "This event doesn’t have a video call"
                → add Google Meet
            - "Enable Google Meet for the meeting"
                → add Meet link only
            - "Add a Meet to event titled X"
                → search → add Meet link

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - meet_link
            - event:
                - id
                - title
                - start
                - end
                - htmlLink
            """
            logger.info(f"[google_add_meet_to_event] wallet={wallet}, worker_id={worker_id}")
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            creator_wallet = cred_result.get("creator_wallet")

            service = build("calendar", "v3", credentials=cred_result["creds"])

            try:
                if not event_id:
                    if not event_title:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Either event_id or event_title is required",
                            }
                        )

                    events_result = (
                        service.events()
                        .list(
                            calendarId=calendar_id,
                            q=event_title,
                            singleEvents=True,
                            orderBy="startTime",
                            maxResults=5,
                        )
                        .execute()
                    )

                    items = events_result.get("items", [])

                    if not items:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"No event found with title '{event_title}'",
                            }
                        )

                    if len(items) > 1:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Multiple events found. Please provide event_id.",
                                "candidates": [
                                    {
                                        "id": e.get("id"),
                                        "summary": e.get("summary"),
                                        "start": e.get("start", {}).get("dateTime"),
                                    }
                                    for e in items
                                ],
                            }
                        )

                    event_id = items[0]["id"]

                event = (
                    service.events()
                    .get(calendarId=calendar_id, eventId=event_id)
                    .execute()
                )
                
                # Non-creator permission check: can only add Meet to events where creator is sole attendee
                if not is_creator:
                    creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                    
                    if not creator_email:
                        return json.dumps({
                            "success": False,
                            "message": "Could not resolve creator's email for validation",
                        })
                    
                    event_attendees = event.get("attendees", [])
                    attendee_emails = [a.get("email", "").lower() for a in event_attendees]
                    
                    if len(attendee_emails) != 1 or attendee_emails[0] != creator_email.lower():
                        return json.dumps({
                            "success": False,
                            "message": "Non-creator can only add Meet to events where the creator is the sole attendee",
                        })
                    
                    logger.info(f"[google_add_meet_to_event] Non-creator adding Meet to event with creator as sole attendee")

                existing_meet = event.get("hangoutLink") or event.get(
                    "conferenceData", {}
                ).get("entryPoints", [{}])[0].get("uri")

                if existing_meet:
                    return json.dumps(
                        {
                            "success": True,
                            "message": "Event already has a Meet link",
                            "meet_link": existing_meet,
                            "event_id": event_id,
                        }
                    )

                event["conferenceData"] = {
                    "createRequest": {
                        "requestId": f"add-meet-{int(datetime.now().timestamp())}",
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                }

                updated_event = (
                    service.events()
                    .update(
                        calendarId=calendar_id,
                        eventId=event_id,
                        body=event,
                        conferenceDataVersion=1,
                    )
                    .execute()
                )

                meet_link = updated_event.get("hangoutLink") or updated_event.get(
                    "conferenceData", {}
                ).get("entryPoints", [{}])[0].get("uri")

                return json.dumps(
                    {
                        "success": True,
                        "message": "Meet link added to event successfully",
                        "meet_link": meet_link,
                        "event": {
                            "id": updated_event.get("id"),
                            "title": updated_event.get("summary"),
                            "start": updated_event.get("start", {}).get("dateTime"),
                            "end": updated_event.get("end", {}).get("dateTime"),
                            "htmlLink": updated_event.get("htmlLink"),
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error adding Meet to event: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_add_meet_to_event = google_add_meet_to_event

        @self.mcp.tool
        async def google_link_drive_artifacts_to_meet(
            wallet: str,
            worker_id: str,
            event_id: Optional[str] = None,
            meet_link: Optional[str] = None,
            drive_file_ids: Optional[str] = None,
            search_auto: bool = True,
        ) -> str:
            """
            Link Google Drive Artifacts (Recordings / Transcripts / Docs) to a Google Meet Event

            PURPOSE:
            This tool links existing Google Drive files — such as:
            - Google Meet recordings (videos)
            - Meeting transcripts
            - Related documents or notes

            to a Google Calendar event that contains a Google Meet meeting.

            The files are ATTACHED to the calendar event and also added to the
            event description for easy access by all attendees.

            USE THIS TOOL WHEN THE USER ASKS:
            - "Attach the meeting recording to the event"
            - "Link the Meet recording to the calendar event"
            - "Add the transcript to the meeting"
            - "Connect Drive files to this Meet"
            - "Attach meeting artifacts to the calendar"
            - "Add recording and transcript to the event"
            - "Link Drive documents to the Meet"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a Meet link
            → use google_create_instant_meet / google_create_meet_link_for_later
            - The user wants event details or recordings info only
            → use google_get_meet_metadata
            - The user wants to download files
            → use google_download_attachments
            - The user wants to search Drive without linking
            → use Drive search tools

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool DOES NOT upload files to Drive.
            - This tool DOES NOT create recordings or transcripts.
            - It ONLY LINKS existing Drive files to an existing calendar event.
            - Either `event_id` OR `meet_link` is required to identify the meeting.
            - If both are provided, `event_id` takes priority.
            - If no artifacts are found, return success with an empty list.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar + Drive OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only link artifacts to events where the creator is the sole attendee.

            EVENT IDENTIFICATION (ONE IS REQUIRED):
            - event_id (string, optional):
                Google Calendar event ID of the meeting.
                Use this when the event ID is already known.

            - meet_link (string, optional):
                Google Meet URL.
                Used to locate the calendar event when event_id is not available.

            ARTIFACT SELECTION OPTIONS:
            - drive_file_ids (string, optional):
                Comma-separated Google Drive file IDs to explicitly attach.
                Example:
                "1AbC..., 2XyZ..."

            - search_auto (boolean, default: True):
                If True, the tool will automatically search Google Drive for:
                - Meet recordings
                - Transcripts
                - Files matching event title or Meet code
                - Files created around the meeting time

            AUTO-SEARCH STRATEGY:
            The tool may search Drive using:
            - Event title keywords
            - Meet code
            - File type (video / transcript)
            - Creation time near the meeting start

            WHAT THIS TOOL DOES:
            - Finds the calendar event
            - Locates Drive artifacts (manual + auto)
            - Appends artifact links to:
                1) Event description (Meeting Artifacts section)
                2) Event attachments (Google Calendar native attachments)

            WHAT THIS TOOL RETURNS:
            - success status
            - Event metadata (id, title, htmlLink, meet_link)
            - Linked artifacts list:
                - File ID
                - Name
                - Type (recording / transcript / document)
                - Drive link
                - Size
            - Counts of auto-found vs manually provided files

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Attach the recording to the meeting"
                → search Drive → link recording
            - "Add transcript to calendar event"
                → find transcript → attach
            - "Link Drive docs to this Meet"
                → attach specified file IDs
            - "Add all meeting artifacts"
                → auto-search + link everything found

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - event:
                - id
                - title
                - htmlLink
                - meet_link
            - artifacts:
                - count
                - items[]
                - auto_found
                - manually_specified
            """
            logger.info(f"[google_link_drive_artifacts_to_meet] wallet={wallet}, worker_id={worker_id}")
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            creator_wallet = cred_result.get("creator_wallet")

            calendar_service = build("calendar", "v3", credentials=cred_result["creds"])
            drive_service = build("drive", "v3", credentials=cred_result["creds"])

            try:
                if not event_id and meet_link:
                    meet_code = None
                    if "meet.google.com/" in meet_link:
                        meet_code = meet_link.split("meet.google.com/")[-1].split("?")[
                            0
                        ]

                    if not meet_code:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Invalid Meet link format",
                            }
                        )

                    events_result = (
                        calendar_service.events()
                        .list(
                            calendarId="primary",
                            maxResults=50,
                            singleEvents=True,
                        )
                        .execute()
                    )

                    for event in events_result.get("items", []):
                        event_meet_link = event.get("hangoutLink") or event.get(
                            "conferenceData", {}
                        ).get("entryPoints", [{}])[0].get("uri", "")

                        if meet_code in event_meet_link:
                            event_id = event.get("id")
                            break

                    if not event_id:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "No event found with this Meet link",
                            }
                        )

                elif not event_id:
                    return json.dumps(
                        {
                            "success": False,
                            "message": "Either event_id or meet_link is required",
                        }
                    )

                event = (
                    calendar_service.events()
                    .get(calendarId="primary", eventId=event_id)
                    .execute()
                )
                
                # Non-creator permission check: can only link artifacts to events where creator is sole attendee
                if not is_creator:
                    creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                    
                    if not creator_email:
                        return json.dumps({
                            "success": False,
                            "message": "Could not resolve creator's email for validation",
                        })
                    
                    event_attendees = event.get("attendees", [])
                    attendee_emails = [a.get("email", "").lower() for a in event_attendees]
                    
                    if len(attendee_emails) != 1 or attendee_emails[0] != creator_email.lower():
                        return json.dumps({
                            "success": False,
                            "message": "Non-creator can only link artifacts to events where the creator is the sole attendee",
                        })
                    
                    logger.info(f"[google_link_drive_artifacts_to_meet] Non-creator linking artifacts to event with creator as sole attendee")

                event_title = event.get("summary", "")
                meet_link = event.get("hangoutLink") or event.get(
                    "conferenceData", {}
                ).get("entryPoints", [{}])[0].get("uri", "")
                meet_code = (
                    meet_link.split("meet.google.com/")[-1].split("?")[0]
                    if meet_link
                    else ""
                )

                file_ids_to_attach = []

                if drive_file_ids:
                    file_ids_to_attach.extend(
                        [fid.strip() for fid in drive_file_ids.split(",")]
                    )

                auto_found_files = []
                if search_auto:
                    search_queries = []

                    if event_title:
                        search_queries.append(
                            f"(name contains '{event_title}' or fullText contains '{event_title}') and "
                            f"(mimeType contains 'video' or name contains 'transcript' or name contains 'recording')"
                        )

                    if meet_code:
                        search_queries.append(
                            f"(name contains '{meet_code}' or fullText contains '{meet_code}') and "
                            f"(mimeType contains 'video' or name contains 'transcript')"
                        )

                    event_start = event.get("start", {}).get("dateTime")
                    if event_start:
                        try:
                            start_dt = datetime.fromisoformat(
                                event_start.replace("Z", "+00:00")
                            )
                            search_start = (start_dt - timedelta(hours=1)).isoformat()
                            search_end = (start_dt + timedelta(hours=4)).isoformat()

                            if event_title:
                                search_queries.append(
                                    f"name contains '{event_title}' and "
                                    f"createdTime >= '{search_start}' and createdTime <= '{search_end}' and "
                                    f"(mimeType contains 'video' or name contains 'transcript')"
                                )
                        except Exception:
                            pass

                    for query in search_queries:
                        try:
                            results = (
                                drive_service.files()
                                .list(
                                    q=query,
                                    pageSize=20,
                                    fields="files(id, name, mimeType, webViewLink, createdTime, size)",
                                    orderBy="createdTime desc",
                                )
                                .execute()
                            )

                            for file in results.get("files", []):
                                if file["id"] not in file_ids_to_attach:
                                    file_ids_to_attach.append(file["id"])
                                    auto_found_files.append(file)

                        except Exception as e:
                            logger.warning(f"Drive search query failed: {e}")
                            continue

                if not file_ids_to_attach:
                    return json.dumps(
                        {
                            "success": True,
                            "message": "No artifacts found to link",
                            "event_id": event_id,
                            "artifacts": [],
                        }
                    )

                linked_artifacts = []

                for file_id in file_ids_to_attach:
                    try:
                        file_metadata = (
                            drive_service.files()
                            .get(
                                fileId=file_id,
                                fields="id, name, mimeType, webViewLink, iconLink, size",
                            )
                            .execute()
                        )

                        linked_artifacts.append(
                            {
                                "id": file_metadata.get("id"),
                                "name": file_metadata.get("name"),
                                "type": (
                                    "recording"
                                    if "video" in file_metadata.get("mimeType", "")
                                    else (
                                        "transcript"
                                        if "transcript"
                                        in file_metadata.get("name", "").lower()
                                        else "document"
                                    )
                                ),
                                "mimeType": file_metadata.get("mimeType"),
                                "link": file_metadata.get("webViewLink"),
                                "iconLink": file_metadata.get("iconLink"),
                                "size": file_metadata.get("size"),
                            }
                        )

                    except Exception as e:
                        logger.error(f"Failed to get file {file_id}: {e}")
                        continue

                current_description = event.get("description", "")

                artifacts_section = "\n\n📎 **Meeting Artifacts:**\n"
                for artifact in linked_artifacts:
                    artifact_type = artifact["type"].title()
                    artifacts_section += (
                        f"• [{artifact_type}] {artifact['name']}: {artifact['link']}\n"
                    )

                if "📎 **Meeting Artifacts:**" in current_description:
                    parts = current_description.split("📎 **Meeting Artifacts:**")
                    updated_description = parts[0].rstrip() + artifacts_section
                else:
                    updated_description = (
                        current_description.rstrip() + artifacts_section
                    )

                event["description"] = updated_description

                if "attachments" not in event:
                    event["attachments"] = []

                for artifact in linked_artifacts:
                    already_attached = any(
                        att.get("fileId") == artifact["id"]
                        for att in event.get("attachments", [])
                    )

                    if not already_attached:
                        event["attachments"].append(
                            {
                                "fileUrl": artifact["link"],
                                "title": artifact["name"],
                                "mimeType": artifact.get("mimeType"),
                                "iconLink": artifact.get("iconLink"),
                                "fileId": artifact["id"],
                            }
                        )

                updated_event = (
                    calendar_service.events()
                    .update(
                        calendarId="primary",
                        eventId=event_id,
                        body=event,
                        supportsAttachments=True,
                    )
                    .execute()
                )

                return json.dumps(
                    {
                        "success": True,
                        "message": f"Successfully linked {len(linked_artifacts)} artifact(s) to meeting",
                        "event": {
                            "id": updated_event.get("id"),
                            "title": updated_event.get("summary"),
                            "htmlLink": updated_event.get("htmlLink"),
                            "meet_link": meet_link,
                        },
                        "artifacts": {
                            "count": len(linked_artifacts),
                            "items": linked_artifacts,
                            "auto_found": len(auto_found_files),
                            "manually_specified": (
                                len(drive_file_ids.split(",")) if drive_file_ids else 0
                            ),
                        },
                        "note": "Artifacts are linked from Google Drive. Access them via the event or Drive directly.",
                    }
                )

            except Exception as e:
                logger.error(f"Error linking Drive artifacts: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_link_drive_artifacts_to_meet = google_link_drive_artifacts_to_meet

    def _routes(self):
        @self.mcp.custom_route("/health", methods=["GET"])
        async def health(req):
            from starlette.responses import JSONResponse

            return JSONResponse(
                {
                    "status": "ok",
                    "server": "GoogleMeet-Server",
                    "time": datetime.now(timezone.utc).isoformat(),
                }
            )

        @self.mcp.custom_route("/", methods=["GET"])
        async def root(req):
            from starlette.responses import JSONResponse

            return JSONResponse(
                {
                    "server": "GoogleMeet-Server",
                    "status": "running",
                    "description": "MCP server for Google Meet link creation and management",
                    "endpoints": {
                        "health": "/health",
                        "mcp": "/mcp/ (MCP protocol endpoint)",
                    },
                    "tools": [
                        "google_create_instant_meet",
                        "google_create_meet_link_for_later",
                        "google_get_meet_metadata",
                        "google_add_meet_to_event",
                    ],
                }
            )
            return response

    def run(self):
        self.mcp.run(
            transport="http",
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8003")),
            log_level=os.getenv("LOG_LEVEL", "info"),
        )


def main():
    server = GoogleMeetMCPServer()
    server.run()


if __name__ == "__main__":
    main()
