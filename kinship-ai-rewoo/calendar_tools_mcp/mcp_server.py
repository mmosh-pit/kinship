"""
Google Calendar MCP Server
"""

import json
import logging
from datetime import datetime, timezone, timedelta
import os
from typing import Optional
from fastmcp import FastMCP
from googleapiclient.discovery import build
from calendar_utils import (
    get_google_credentials_by_wallet,
    get_credentials_unified,
    has_connected_google_account,
    has_member,
    normalize_datetime,
    check_read_permission,
    check_send_permission,
    users_collection,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GoogleCalendarMCPServer:
    def __init__(self, name="GoogleCalendar-Server"):
        self.mcp = FastMCP(name)
        self._register_tools()
        self._routes()

    def _register_tools(self):
        @self.mcp.tool
        async def google_list_calendars(
            wallet: str,
            worker_id: str,
            show_hidden: bool = False
        ) -> str:
            """
            List Google Calendars for the Authenticated User

            PURPOSE:
            This tool retrieves **all Google Calendars** available to the authenticated user,
            including:
            - Primary calendar
            - Secondary calendars
            - Shared calendars
            - (Optionally) hidden calendars

            USE THIS TOOL WHEN THE USER SAYS:
            - "List my calendars"
            - "Show all my Google calendars"
            - "Which calendars do I have?"
            - "Show my calendar list"
            - "Get available calendars"
            - "List hidden calendars"
            - "Which calendar IDs can I use?"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create, update, or delete an event
            - The user is asking about a specific event
            - The user wants to schedule or cancel meetings

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user asks about **available calendars or calendar IDs**, the assistant MUST call this tool.
            - The assistant MUST NOT invent calendar IDs.
            - The assistant MUST return the results exactly as provided by the tool.
            - If no calendars exist, return an empty list with a success message.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to access Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Only the creator can list calendars.

            OPTIONAL PARAMETERS:
            - show_hidden (boolean, default: false):
                false → Return only visible calendars (recommended default)
                true  → Return only hidden calendars

            COMMON USAGE EXAMPLES:
            - "Show my calendars" → show_hidden = false
            - "List hidden calendars" → show_hidden = true
            - "Which calendar ID should I use?" → show_hidden = false

            RETURNS:
            JSON with:
            - success (boolean)
            - count (number of calendars returned)
            - calendars[]:
                - id (calendar ID)
                - summary (calendar name)
                - primary (true if primary calendar)
                - timeZone
                - hidden (true/false)

            NOTE:
            The returned calendar `id` values can be used in other tools such as:
            - google_create_event
            - google_update_event
            - google_cancel_event
            """
            logger.info(f"[google_list_calendars] wallet={wallet}, worker_id={worker_id}")
            
            # Check read permission (only creator can list calendars)
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
                response = service.calendarList().list(showHidden=True).execute()
            except Exception as e:
                return json.dumps({"success": False, "message": str(e)})

            calendars = [
                {
                    "id": c["id"],
                    "summary": c.get("summary"),
                    "primary": c.get("primary", False),
                    "timeZone": c.get("timeZone"),
                    "hidden": c.get("hidden", False),
                }
                for c in response.get("items", [])
                if (show_hidden and c.get("hidden", False))
                or (not show_hidden and not c.get("hidden", False))
            ]

            return json.dumps(
                {
                    "success": True,
                    "count": len(calendars),
                    "calendars": calendars,
                }
            )

        self.google_list_calendars = google_list_calendars

        @self.mcp.tool
        async def google_read_events(
            wallet: str,
            worker_id: str,
            calendar_id: str = "primary",
            time_min: Optional[str] = None,
            time_max: Optional[str] = None,
            max_results: int = 10,
            read_type: str = "full",  # "full" or "freebusy"
        ) -> str:
            """
            Read Google Calendar Events (Details or Availability)

            PURPOSE:
            This tool retrieves calendar information from Google Calendar for a given time range.
            It supports two modes:
            1) FULL EVENT DETAILS → titles, times, attendees, location, Meet links
            2) FREE/BUSY AVAILABILITY → busy time blocks only (no event details)

            USE THIS TOOL WHEN THE USER SAYS:
            - "Show my calendar events"
            - "What meetings do I have today?"
            - "List upcoming events"
            - "What’s on my calendar this week?"
            - "Am I free tomorrow?"
            - "Check my availability"
            - "Show busy slots"
            - "Do I have any meetings between X and Y?"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create, update, cancel, or invite attendees to an event
            - The user wants to list calendars (use google_list_calendars instead)

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - If the user asks about **existing events or availability**, the assistant MUST call this tool.
            - If the user asks **“am I free?”**, **“check availability”**, or **“busy slots”**, use `read_type="freebusy"`.
            - If the user asks for **event details**, use `read_type="full"`.
            - The assistant MUST NOT invent calendar events or availability.
            - Always return the tool response directly.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Only the creator can read calendar events.

            OPTIONAL PARAMETERS:
            - calendar_id (string, default: "primary"):
                Google Calendar ID to read from.
                Use "primary" unless the user explicitly specifies another calendar.

            - time_min (string, ISO 8601):
                Start of the time window.
                Examples:
                - "2024-02-01T10:00:00Z"
                - If omitted, defaults to current time (now).

            - time_max (string, ISO 8601):
                End of the time window.
                Examples:
                - "2024-02-07T18:00:00Z"
                - If omitted, defaults to 7 days from now.

            - max_results (integer, default: 10):
                Maximum number of events to return (applies to full mode only).

            - read_type (string, default: "full"):
                Controls output type:
                - "full"     → Complete event details (title, time, attendees, Meet link, etc.)
                - "freebusy" → Busy time blocks only (availability checking)

            COMMON USAGE EXAMPLES:
            - "Show my upcoming meetings" → read_type="full"
            - "What events do I have today?" → read_type="full"
            - "Am I free tomorrow afternoon?" → read_type="freebusy"
            - "Check my availability this week" → read_type="freebusy"

            RETURNS:
            JSON with:
            - success (boolean)
            - read_type ("full" | "freebusy")
            - calendar_id
            - time_min
            - time_max

            IF read_type = "full":
            - count
            - events[]:
                - id
                - summary
                - description
                - start
                - end
                - location
                - attendees (email, responseStatus, organizer)
                - hangoutLink / meetLink
                - status

            IF read_type = "freebusy":
            - busy_periods[]:
                - start
                - end

            NOTE:
            The returned event `id` values can be used in:
            - google_update_event
            - google_cancel_event
            - google_invite_attendees
            """
            logger.info(f"[google_read_events] wallet={wallet}, worker_id={worker_id}")
            
            # Check read permission (only creator can read events)
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

            if not time_min:
                time_min = datetime.now(timezone.utc).isoformat()
            if not time_max:
                time_max = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

            try:
                if read_type == "freebusy":
                    body = {
                        "timeMin": time_min,
                        "timeMax": time_max,
                        "items": [{"id": calendar_id}],
                    }

                    response = service.freebusy().query(body=body).execute()

                    busy_periods = (
                        response.get("calendars", {})
                        .get(calendar_id, {})
                        .get("busy", [])
                    )

                    return json.dumps(
                        {
                            "success": True,
                            "read_type": "freebusy",
                            "calendar_id": calendar_id,
                            "time_min": time_min,
                            "time_max": time_max,
                            "busy_periods": busy_periods,
                        }
                    )

                else:  # full details
                    events_result = (
                        service.events()
                        .list(
                            calendarId=calendar_id,
                            timeMin=time_min,
                            timeMax=time_max,
                            maxResults=max_results,
                            singleEvents=True,
                            orderBy="startTime",
                        )
                        .execute()
                    )

                    events = events_result.get("items", [])

                    formatted_events = [
                        {
                            "id": e.get("id"),
                            "summary": e.get("summary"),
                            "description": e.get("description"),
                            "start": e.get("start", {}).get("dateTime")
                            or e.get("start", {}).get("date"),
                            "end": e.get("end", {}).get("dateTime")
                            or e.get("end", {}).get("date"),
                            "location": e.get("location"),
                            "attendees": [
                                {
                                    "email": a.get("email"),
                                    "responseStatus": a.get("responseStatus"),
                                    "organizer": a.get("organizer", False),
                                }
                                for a in e.get("attendees", [])
                            ],
                            "hangoutLink": e.get("hangoutLink"),
                            "meetLink": e.get("conferenceData", {})
                            .get("entryPoints", [{}])[0]
                            .get("uri"),
                            "status": e.get("status"),
                        }
                        for e in events
                    ]

                    return json.dumps(
                        {
                            "success": True,
                            "read_type": "full",
                            "calendar_id": calendar_id,
                            "count": len(formatted_events),
                            "events": formatted_events,
                        }
                    )

            except Exception as e:
                logger.error(f"Error reading events: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_read_events = google_read_events

        @self.mcp.tool
        async def google_search_events(
            wallet: str,
            query: str,
            worker_id: str,
            calendar_id: str = "primary",
            time_min: Optional[str] = None,
            time_max: Optional[str] = None,
            max_results: int = 10,
        ) -> str:
            """
            Search Google Calendar Events by Text (RFC3339 Time Required)

            PURPOSE:
            Search Google Calendar events using a free-text query.
            Matches against:
            - Event title (summary)
            - Description
            - Location
            - Attendee email addresses

            ─────────────────────────────────────────────────────────
            CRITICAL TIME FORMAT REQUIREMENT (MUST FOLLOW)
            ─────────────────────────────────────────────────────────
            Google Calendar ONLY accepts RFC3339 timestamps WITH timezone.

            INVALID (will cause 400 Bad Request):
                - "2026-01-23T00:00:00"
                - "2026-01-23 00:00:00"
                - "2026-01-23"

            VALID:
                - "2026-01-23T00:00:00Z"
                - "2026-01-23T23:59:59Z"
                - "2026-01-23T00:00:00+05:30"

            IF THE USER USES RELATIVE TIME EXPRESSIONS:
                - "today"
                - "tomorrow"
                - "this week"
                - "next week"
                - "this month"

            The assistant MUST convert them into a FULL RFC3339 time range
            **including timezone** BEFORE calling this tool.

            ─────────────────────────────────────────────────────────
            USE THIS TOOL WHEN THE USER SAYS:
            - "Find meetings about X"
            - "Search calendar for standup"
            - "Do I have any events with John?"
            - "Find meetings related to project Alpha"
            - "Search my calendar for interviews"
            - "Show events containing the word demo"

            DO NOT USE THIS TOOL WHEN:
            - The user wants all upcoming events → google_read_events
            - The user wants availability/free time → google_read_events (freebusy)
            - The user wants to create, update, cancel, or invite attendees

            ─────────────────────────────────────────────────────────
            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier for Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Only the creator can search calendar events.

            - query (string):
                Free-text search query.
                Examples:
                - "standup"
                - "demo"
                - "interview"
                - "john@example.com"
                - "project alpha"

            ─────────────────────────────────────────────────────────
            OPTIONAL PARAMETERS:
            - calendar_id (string, default: "primary"):
                Calendar to search in.

            - time_min (string, RFC3339 WITH TIMEZONE):
                Start of search window.
                Example:
                "2026-01-23T00:00:00Z"

            - time_max (string, RFC3339 WITH TIMEZONE):
                End of search window.
                Example:
                "2026-01-23T23:59:59Z"

            - max_results (integer, default: 10):
                Maximum number of matching events.

            IF time_min / time_max ARE NOT PROVIDED:
            - The search runs without a time boundary.

            ─────────────────────────────────────────────────────────
            COMMON INTENT → CORRECT PARAMS:
            - "Find demos tomorrow"
                → query="demo"
                → time_min="YYYY-MM-DDT00:00:00Z"
                → time_max="YYYY-MM-DDT23:59:59Z"

            - "Search calendar for interviews next week"
                → query="interview"
                → time_min=start of next week (RFC3339)
                → time_max=end of next week (RFC3339)
            - "Find meetings about marketing" → query="marketing"
            - "Search my calendar for interviews next week"
            - "Do I have any events with Alice?"
            - "Find all demos this month"

            ─────────────────────────────────────────────────────────
            RETURNS:
            JSON with:
            - success (boolean)
            - query (string)
            - count (number)
            - events[]:
                - id
                - summary
                - description
                - start
                - end
                - location
                - attendees
                - meetLink

            NOTE:
            Returned event IDs can be used with:
            - google_update_event
            - google_cancel_event
            - google_invite_attendees
            """
            logger.info(f"[google_search_events] wallet={wallet}, worker_id={worker_id}, query={query}")
            
            # Check read permission (only creator can search events)
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
                params = {
                    "calendarId": calendar_id,
                    "q": query,
                    "maxResults": max_results,
                    "singleEvents": True,
                    "orderBy": "startTime",
                }

                if time_min:
                    params["timeMin"] = time_min
                if time_max:
                    params["timeMax"] = time_max

                events_result = service.events().list(**params).execute()

                events = events_result.get("items", [])

                formatted_events = [
                    {
                        "id": e.get("id"),
                        "summary": e.get("summary"),
                        "description": e.get("description"),
                        "start": e.get("start", {}).get("dateTime")
                        or e.get("start", {}).get("date"),
                        "end": e.get("end", {}).get("dateTime")
                        or e.get("end", {}).get("date"),
                        "location": e.get("location"),
                        "attendees": [a.get("email") for a in e.get("attendees", [])],
                        "meetLink": e.get("hangoutLink")
                        or e.get("conferenceData", {})
                        .get("entryPoints", [{}])[0]
                        .get("uri"),
                    }
                    for e in events
                ]

                return json.dumps(
                    {
                        "success": True,
                        "query": query,
                        "count": len(formatted_events),
                        "events": formatted_events,
                    }
                )

            except Exception as e:
                logger.error(f"Error searching events: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_search_events = google_search_events

        @self.mcp.tool
        async def google_create_event(
            wallet: str,
            summary: str,
            start_time: str,
            end_time: str,
            worker_id: str,
            calendar_id: str = "primary",
            description: Optional[str] = None,
            location: Optional[str] = None,
            attendees: Optional[str] = None,  # Comma-separated emails
            generate_meet_link: bool = False,
            timezone: Optional[str] = "UTC",
        ) -> str:
            """
            Create a New Google Calendar Event

            PURPOSE:
            This tool creates a brand-new event in Google Calendar for the authenticated user.
            It supports time-based events, attendee invitations, and optional Google Meet links.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Create a meeting"
            - "Schedule an event"
            - "Add a calendar event"
            - "Book a meeting for tomorrow"
            - "Schedule a call with John at 3 PM"
            - "Create a standup meeting every day" (single occurrence only)

            DO NOT USE THIS TOOL WHEN:
            - The user wants to update an existing event (use google_update_event)
            - The user wants to cancel an event (use google_cancel_event)
            - The user wants to add attendees to an existing event (use google_invite_attendees)
            - The user is asking what events they have (use google_read_events)

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be called when the user intent is to CREATE or SCHEDULE a new event.
            - The assistant MUST NOT fabricate calendar events in text.
            - If required information is missing, ASK the user before calling the tool.
            - Do NOT guess dates, times, or attendees.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only create events with the creator as the sole attendee.

            - summary (string):
                Event title or meeting name.
                Examples:
                - "Team Standup"
                - "Client Demo"
                - "Project Kickoff Meeting"

            - start_time (string):
                Event start time.
                Accepted formats:
                - ISO 8601 → "2024-02-10T15:00:00Z"
                - Simple format → "2024-02-10 15:00"

            - end_time (string):
                Event end time.
                Accepted formats:
                - ISO 8601 → "2024-02-10T16:00:00Z"
                - Simple format → "2024-02-10 16:00"

            OPTIONAL PARAMETERS:
            - calendar_id (string, default: "primary"):
                Calendar where the event will be created.

            - description (string):
                Event description or agenda.

            - location (string):
                Physical or virtual location.
                Example: "Bangalore Office" or "Zoom"

            - attendees (string):
                Comma-separated list of attendee identifiers.
                Example: "john@example.com, alice@example.com"
                All attendees are membership-verified before adding.

            - generate_meet_link (boolean):
                If True, a Google Meet link will be created and attached to the event.

            - timezone (string, default: "UTC"):
                Timezone used for start and end times.
                Example: "Asia/Kolkata", "America/New_York"

            COMMON USER INTENT → PARAMETER MAPPING:
            - "Schedule a meeting tomorrow at 3 PM"
                → start_time="YYYY-MM-DD 15:00", end_time="YYYY-MM-DD 16:00"
            - "Create a Google Meet for demo"
                → generate_meet_link=True
            - "Invite John and Alice"
                → attendees="john@example.com, alice@example.com"

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - event:
                - id
                - htmlLink
                - summary
                - start
                - end
                - meetLink (if generated)
                - attendees (email list)

            NOTE:
            The returned `event.id` can later be used with:
            - google_update_event
            - google_cancel_event
            - google_invite_attendees
            """
            print("================= wallet =====================", wallet)
            print("================= summary =====================", wallet)
            print("================= start_time =====================", start_time)
            print("================= end_time =====================", end_time)
            print("================= worker_id =====================", worker_id)
            print("================= calendar_id =====================", calendar_id)
            print("================= description =====================", description)
            print("================= location =====================", location)
            print("================= attendees =====================", attendees)
            print("================= generate_meet_link =====================", generate_meet_link)
            print("================= timezone =====================", timezone)
            logger.info(f"[google_create_event] wallet={wallet}, worker_id={worker_id}, summary={summary}")
            
            # Get credentials first to determine is_creator
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            creator_wallet = cred_result.get("creator_wallet")
            
            # Non-creator can create events ONLY with the creator as the SOLE attendee
            if not is_creator:
                if not attendees:
                    return json.dumps({
                        "success": False,
                        "message": "Non-creator must include the creator as the only attendee to create events",
                    })
                
                # Get creator's email to verify they're the only attendee
                from postgres_utils import get_creator_email_from_mongodb
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
                        "message": f"Non-creator can only create events with the creator as the sole attendee. Remove other attendees.",
                    })
                
                if attendee_list[0] != creator_email.lower():
                    return json.dumps({
                        "success": False,
                        "message": f"Non-creator can only create events with the creator ({creator_email}) as the sole attendee",
                    })
                
                logger.info(f"[google_create_event] Non-creator creating event with creator as sole attendee")

            # Verify attendees have membership
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
            start_time = normalize_datetime(start_time, timezone)
            end_time = normalize_datetime(end_time, timezone)

            event_body = {
                "summary": summary,
                "start": {"dateTime": start_time, "timeZone": timezone},
                "end": {"dateTime": end_time, "timeZone": timezone},
            }

            if description:
                event_body["description"] = description
            if location:
                event_body["location"] = location
            if attendee_emails:
                event_body["attendees"] = [{"email": e} for e in attendee_emails]

            if generate_meet_link:
                event_body["conferenceData"] = {
                    "createRequest": {
                        "requestId": f"meet-{datetime.now().timestamp()}",
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                }

            try:
                params = {"calendarId": calendar_id, "body": event_body}

                if generate_meet_link:
                    params["conferenceDataVersion"] = 1

                event = service.events().insert(**params).execute()

                return json.dumps(
                    {
                        "success": True,
                        "message": "Event created successfully",
                        "event": {
                            "id": event.get("id"),
                            "htmlLink": event.get("htmlLink"),
                            "summary": event.get("summary"),
                            "start": event.get("start", {}).get("dateTime"),
                            "end": event.get("end", {}).get("dateTime"),
                            "meetLink": event.get("hangoutLink")
                            or event.get("conferenceData", {})
                            .get("entryPoints", [{}])[0]
                            .get("uri"),
                            "attendees": [
                                a.get("email") for a in event.get("attendees", [])
                            ],
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error creating event: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_create_event = google_create_event

        @self.mcp.tool
        async def google_update_event(
            wallet: str,
            worker_id: str,
            event_id: Optional[str] = None,
            calendar_id: Optional[str] = "primary",
            summary: Optional[str] = None,
            start_time: Optional[str] = None,
            end_time: Optional[str] = None,
            description: Optional[str] = None,
            location: Optional[str] = None,
            attendees: Optional[str] = None,
            timezone: Optional[str] = "UTC",
        ) -> str:
            """
            Update an Existing Google Calendar Event

            PURPOSE:
            This tool updates an already-created Google Calendar event.
            It supports modifying the event title, time, description, location,
            and attendee list.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Update my meeting"
            - "Reschedule the event"
            - "Change the meeting time"
            - "Edit the calendar event"
            - "Move my standup to 4 PM"
            - "Add details to the meeting"
            - "Change the location of the event"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a new event (use google_create_event)
            - The user wants to cancel an event (use google_cancel_event)
            - The user wants to invite attendees only (use google_invite_attendees)
            - The user is asking to view events (use google_read_events)

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be called when the user intent is to MODIFY an existing event.
            - The assistant MUST NOT fabricate event updates in plain text.
            - If the event cannot be uniquely identified, ASK the user to clarify.
            - If no update fields are provided, ASK what should be changed.

            EVENT IDENTIFICATION RULES:
            - If event_id is provided → it is used directly.
            - If event_id is NOT provided:
                - summary (event title) is REQUIRED to locate the event.
                - If multiple matching events are found, the tool will return candidates
                and the assistant must ask the user to confirm.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only update events where the creator is the sole attendee.

            EVENT IDENTIFICATION PARAMETERS:
            - event_id (string, optional):
                Unique Google Calendar event ID.
                If not provided, the tool searches by summary.

            - calendar_id (string, default: "primary"):
                Calendar containing the event.

            UPDATE FIELDS (ALL OPTIONAL):
            - summary (string):
                New event title.

            - start_time (string):
                New event start time.
                Accepted formats:
                - ISO 8601 → "2024-02-10T15:00:00Z"
                - Simple format → "2024-02-10 15:00"

            - end_time (string):
                New event end time.
                Accepted formats:
                - ISO 8601 → "2024-02-10T16:00:00Z"
                - Simple format → "2024-02-10 16:00"

            - description (string):
                Updated agenda or notes.

            - location (string):
                Updated physical or virtual location.

            - attendees (string):
                Comma-separated list of attendee identifiers.
                Example:
                "john@example.com, alice@example.com"
                All attendees are membership-verified before updating.

            - timezone (string, default: "UTC"):
                Timezone for start and end times.
                Example: "Asia/Kolkata", "America/New_York"

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Reschedule my demo to tomorrow at 5 PM"
                → update start_time + end_time
            - "Change meeting title to Sprint Review"
                → update summary
            - "Add John to the meeting"
                → update attendees
            - "Update meeting description"
                → update description

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - event:
                - id
                - htmlLink
                - summary
                - start
                - end
                - attendees

            NOTE:
            The updated event ID remains the same and can still be used with:
            - google_cancel_event
            - google_invite_attendees
            """
            logger.info(f"[google_update_event] wallet={wallet}, worker_id={worker_id}, event_id={event_id}")
            
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
                    if not summary:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Event title (summary) is required to identify the event",
                            }
                        )

                    search_params = {
                        "calendarId": calendar_id,
                        "q": summary,
                        "singleEvents": True,
                        "orderBy": "startTime",
                        "maxResults": 5,
                    }

                    if start_time:
                        search_params["timeMin"] = start_time

                    events_result = service.events().list(**search_params).execute()
                    items = events_result.get("items", [])

                    if not items:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"No calendar event found with title '{summary}'",
                            }
                        )

                    if len(items) > 1:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Multiple events found. Please be more specific.",
                                "candidates": [
                                    {
                                        "id": e.get("id"),
                                        "summary": e.get("summary"),
                                        "start": e.get("start", {}).get("dateTime"),
                                        "htmlLink": e.get("htmlLink"),
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
                
                # Non-creator can only update events where creator is the SOLE attendee
                if not is_creator:
                    from postgres_utils import get_creator_email_from_mongodb
                    creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                    
                    if not creator_email:
                        return json.dumps({
                            "success": False,
                            "message": "Could not resolve creator's email for validation",
                        })
                    
                    # Check if creator is the ONLY attendee in event
                    event_attendees = [a.get("email", "").lower() for a in event.get("attendees", [])]
                    
                    if len(event_attendees) != 1 or event_attendees[0] != creator_email.lower():
                        return json.dumps({
                            "success": False,
                            "message": "Non-creator can only update events where the creator is the sole attendee",
                        })
                    
                    logger.info(f"[google_update_event] Non-creator updating event with creator as sole attendee")

                if summary:
                    event["summary"] = summary
                if description is not None:
                    event["description"] = description
                if location is not None:
                    event["location"] = location

                if start_time:
                    event["start"] = {"dateTime": start_time, "timeZone": timezone}
                if end_time:
                    event["end"] = {"dateTime": end_time, "timeZone": timezone}

                if attendees is not None:
                    attendee_emails = []
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

                    event["attendees"] = [{"email": e} for e in attendee_emails]

                updated_event = (
                    service.events()
                    .update(calendarId=calendar_id, eventId=event_id, body=event)
                    .execute()
                )

                return json.dumps(
                    {
                        "success": True,
                        "message": "Event updated successfully",
                        "event": {
                            "id": updated_event.get("id"),
                            "htmlLink": updated_event.get("htmlLink"),
                            "summary": updated_event.get("summary"),
                            "start": updated_event.get("start", {}).get("dateTime"),
                            "end": updated_event.get("end", {}).get("dateTime"),
                            "attendees": [
                                a.get("email")
                                for a in updated_event.get("attendees", [])
                            ],
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Error updating event: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_update_event = google_update_event

        @self.mcp.tool
        async def google_cancel_event(
            wallet: str,
            worker_id: str,
            event_id: Optional[str] = None,
            calendar_id: str = "primary",
            send_notifications: bool = True,
            summary: Optional[str] = None,
            start_time: Optional[str] = None,
        ) -> str:
            """
            Cancel / Delete a Google Calendar Event

            PURPOSE:
            This tool permanently cancels (deletes) an existing Google Calendar event.
            It optionally sends cancellation notifications to all attendees.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Cancel my meeting"
            - "Delete the calendar event"
            - "Remove my appointment"
            - "Call off the meeting"
            - "Cancel tomorrow’s standup"
            - "Delete the event from my calendar"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a new event (use google_create_event)
            - The user wants to update details (use google_update_event)
            - The user wants to add attendees (use google_invite_attendees)
            - The user only wants to read or search events

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be used when the user intent is to CANCEL or DELETE an event.
            - The assistant MUST NOT pretend to cancel events in plain text.
            - If the event cannot be uniquely identified, ASK the user to clarify.
            - If multiple events match, present candidates and wait for confirmation.

            EVENT IDENTIFICATION RULES:
            - If event_id is provided → it is used directly.
            - If event_id is NOT provided:
                - summary (event title) is REQUIRED.
                - The tool searches the calendar using the summary text.
                - If multiple events match, the tool returns candidates.
                - The assistant must ask the user to choose one.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only cancel events where the creator is the sole attendee.

            EVENT IDENTIFICATION PARAMETERS:
            - event_id (string, optional):
                Google Calendar event ID.
                If not provided, the event is resolved internally using summary.

            - summary (string, optional):
                Event title used to locate the event when event_id is missing.
                Example:
                "Team Standup", "Client Demo", "Sprint Review"

            - start_time (string, optional):
                ISO 8601 start time filter used to disambiguate events.
                Example:
                "2024-02-10T10:00:00Z"

            CALENDAR PARAMETERS:
            - calendar_id (string, default: "primary"):
                Calendar containing the event.

            NOTIFICATION BEHAVIOR:
            - send_notifications (boolean, default: True):
                If True:
                - Google sends cancellation emails to all attendees.
                If False:
                - Event is silently removed without notifications.

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Cancel my meeting with John"
                → search by summary, cancel event
            - "Delete tomorrow’s standup"
                → search by summary + start_time, cancel event
            - "Cancel event ID abc123"
                → cancel directly using event_id
            - "Remove the meeting without notifying anyone"
                → send_notifications = False

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - event_id
            - notifications_sent (boolean)

            WARNING:
            - This action is destructive.
            - Cancelled events cannot be recovered.
            """
            logger.info(f"[google_cancel_event] wallet={wallet}, worker_id={worker_id}, event_id={event_id}")
            
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
                    if not summary:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Event title (summary) is required to identify the event",
                            }
                        )

                    search_params = {
                        "calendarId": calendar_id,
                        "q": summary,
                        "singleEvents": True,
                        "orderBy": "startTime",
                        "maxResults": 5,
                    }

                    if start_time:
                        search_params["timeMin"] = start_time

                    events_result = service.events().list(**search_params).execute()
                    items = events_result.get("items", [])

                    if not items:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"No calendar event found with title '{summary}'",
                            }
                        )

                    if len(items) > 1:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Multiple events found. Please be more specific.",
                                "candidates": [
                                    {
                                        "id": e.get("id"),
                                        "summary": e.get("summary"),
                                        "start": e.get("start", {}).get("dateTime"),
                                        "htmlLink": e.get("htmlLink"),
                                    }
                                    for e in items
                                ],
                            }
                        )

                    event_id = items[0]["id"]
                
                # Non-creator can only cancel events where creator is an attendee
                # First fetch the event to check attendees
                if not is_creator:
                    event = (
                        service.events()
                        .get(calendarId=calendar_id, eventId=event_id)
                        .execute()
                    )
                    
                    from postgres_utils import get_creator_email_from_mongodb
                    creator_email = get_creator_email_from_mongodb(creator_wallet, users_collection)
                    
                    if not creator_email:
                        return json.dumps({
                            "success": False,
                            "message": "Could not resolve creator's email for validation",
                        })
                    
                    # Check if creator is the ONLY attendee in event
                    event_attendees = [a.get("email", "").lower() for a in event.get("attendees", [])]
                    
                    if len(event_attendees) != 1 or event_attendees[0] != creator_email.lower():
                        return json.dumps({
                            "success": False,
                            "message": "Non-creator can only cancel events where the creator is the sole attendee",
                        })
                    
                    logger.info(f"[google_cancel_event] Non-creator cancelling event with creator as sole attendee")

                service.events().delete(
                    calendarId=calendar_id,
                    eventId=event_id,
                    sendNotifications=send_notifications,
                ).execute()

                return json.dumps(
                    {
                        "success": True,
                        "message": "Event cancelled successfully",
                        "event_id": event_id,
                        "notifications_sent": send_notifications,
                    }
                )

            except Exception as e:
                logger.error(f"Error cancelling event: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_cancel_event = google_cancel_event

        @self.mcp.tool
        async def google_invite_attendees(
            wallet: str,
            attendees: str,  # Comma-separated emails
            worker_id: str,
            event_id: Optional[str] = None,
            calendar_id: str = "primary",
            send_notifications: bool = True,
            summary: Optional[str] = None,
            start_time: Optional[str] = None,
        ) -> str:
            """
            Invite / Add Attendees to an Existing Google Calendar Event

            PURPOSE:
            This tool adds one or more attendees to an existing Google Calendar event.
            All attendees are membership-verified before being added.

            USE THIS TOOL WHEN THE USER SAYS:
            - "Invite John to the meeting"
            - "Add participants to my calendar event"
            - "Include Alice and Bob in the call"
            - "Add attendees to the meeting"
            - "Invite someone to my event"
            - "Add people to the calendar event"

            DO NOT USE THIS TOOL WHEN:
            - The user wants to create a new event (use google_create_event)
            - The user wants to cancel/delete the event (use google_cancel_event)
            - The user wants to update event details (use google_update_event)
            - The user only wants to read or search events

            IMPORTANT ASSISTANT BEHAVIOR RULES:
            - This tool MUST be used when the intent is to ADD / INVITE attendees.
            - The assistant MUST NOT just reply with text saying attendees were added.
            - Membership validation is enforced automatically by the tool.
            - If the event cannot be uniquely identified, ASK the user to clarify.
            - If multiple events match, present candidates and wait for confirmation.

            EVENT IDENTIFICATION RULES:
            - If event_id is provided → it is used directly.
            - If event_id is NOT provided:
                - summary (event title) is REQUIRED.
                - The tool searches the calendar using the summary text.
                - start_time can be used to disambiguate events.
                - If multiple events match, the tool returns candidates.

            REQUIRED PARAMETERS:
            - wallet (string):
                Internal user identifier used to load Google Calendar OAuth credentials.

            - worker_id (string):
                Worker agent ID for access control validation.
                Creator has full access. Non-creator can only invite the creator's email.

            - attendees (string):
                Comma-separated list of email addresses to invite.
                Example:
                "alice@example.com, bob@example.com"

            EVENT IDENTIFICATION PARAMETERS:
            - event_id (string, optional):
                Google Calendar event ID.
                If missing, the event is resolved internally.

            - summary (string, optional but REQUIRED if event_id is missing):
                Event title used to locate the event.
                Example:
                "Team Standup", "Client Demo", "Sprint Review"

            - start_time (string, optional):
                ISO 8601 start time used to disambiguate similar events.
                Example:
                "2024-02-10T10:00:00Z"

            CALENDAR PARAMETERS:
            - calendar_id (string, default: "primary"):
                Calendar containing the event.

            NOTIFICATION BEHAVIOR:
            - send_notifications (boolean, default: True):
                If True:
                - Google sends invitation emails to newly added attendees.
                If False:
                - Attendees are added silently without email notifications.

            COMMON USER INTENT → TOOL BEHAVIOR:
            - "Invite John to tomorrow’s meeting"
                → resolve event → add John → send invite
            - "Add Alice and Bob to the standup"
                → resolve event by summary → add attendees
            - "Add attendees without notifying them"
                → send_notifications = False
            - "Invite someone to event ID abc123"
                → event_id used directly

            RETURNS:
            JSON with:
            - success (boolean)
            - message
            - event_id
            - attendees (email + responseStatus)
            - notifications_sent (boolean)
            """
            logger.info(f"[google_invite_attendees] wallet={wallet}, worker_id={worker_id}, attendees={attendees}")
            
            # Get credentials (unified: MongoDB first, PostgreSQL fallback)
            cred_result = get_credentials_unified(wallet, worker_id)

            if not cred_result["success"]:
                return json.dumps({
                    "success": False,
                    "message": cred_result["message"],
                })
            
            is_creator = cred_result.get("is_creator", False)
            
            # For invite_attendees, non-creators can only invite if all attendees are the creator
            # This allows non-creators to add the creator as attendee
            if not is_creator:
                # Check each attendee - non-creator can only invite the creator
                for email in [e.strip() for e in attendees.split(",")]:
                    permission_check = check_send_permission(wallet, worker_id, email)
                    if not permission_check["allowed"]:
                        return json.dumps({
                            "success": False,
                            "message": permission_check["message"],
                        })

            service = build("calendar", "v3", credentials=cred_result["creds"])

            try:
                if not event_id:
                    if not summary:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Event title (summary) is required to identify the event",
                            }
                        )

                    search_params = {
                        "calendarId": calendar_id,
                        "q": summary,
                        "singleEvents": True,
                        "orderBy": "startTime",
                        "maxResults": 5,
                    }

                    if start_time:
                        search_params["timeMin"] = start_time

                    events_result = service.events().list(**search_params).execute()
                    items = events_result.get("items", [])

                    if not items:
                        return json.dumps(
                            {
                                "success": False,
                                "message": f"No calendar event found with title '{summary}'",
                            }
                        )

                    if len(items) > 1:
                        return json.dumps(
                            {
                                "success": False,
                                "message": "Multiple events found. Please be more specific.",
                                "candidates": [
                                    {
                                        "id": e.get("id"),
                                        "summary": e.get("summary"),
                                        "start": e.get("start", {}).get("dateTime"),
                                        "htmlLink": e.get("htmlLink"),
                                    }
                                    for e in items
                                ],
                            }
                        )

                    event_id = items[0]["id"]

                new_attendee_emails = []
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
                        new_attendee_emails.append(attendee_email)

                event = (
                    service.events()
                    .get(calendarId=calendar_id, eventId=event_id)
                    .execute()
                )

                existing_attendees = event.get("attendees", [])
                existing_emails = {a.get("email") for a in existing_attendees}

                for email in new_attendee_emails:
                    if email not in existing_emails:
                        existing_attendees.append({"email": email})

                event["attendees"] = existing_attendees

                updated_event = (
                    service.events()
                    .update(
                        calendarId=calendar_id,
                        eventId=event_id,
                        body=event,
                        sendNotifications=send_notifications,
                    )
                    .execute()
                )

                return json.dumps(
                    {
                        "success": True,
                        "message": "Attendees invited successfully",
                        "event_id": event_id,
                        "attendees": [
                            {
                                "email": a.get("email"),
                                "responseStatus": a.get("responseStatus"),
                            }
                            for a in updated_event.get("attendees", [])
                        ],
                        "notifications_sent": send_notifications,
                    }
                )

            except Exception as e:
                logger.error(f"Error inviting attendees: {e}")
                return json.dumps({"success": False, "message": str(e)})

        self.google_invite_attendees = google_invite_attendees

    def _routes(self):
        @self.mcp.custom_route("/health", methods=["GET"])
        async def health(req):
            from starlette.responses import JSONResponse

            return JSONResponse(
                {
                    "status": "ok",
                    "server": "GoogleCalendar-Server",
                    "time": datetime.now(timezone.utc).isoformat(),
                }
            )

    def run(self):
        self.mcp.run(
            transport="http",
            host="0.0.0.0",
            port=int(os.getenv("PORT", "8002")),
            log_level=os.getenv("LOG_LEVEL"),
        )


def main():
    server = GoogleCalendarMCPServer()
    server.run()


if __name__ == "__main__":
    main()
