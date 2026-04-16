"""
Kinship Agent - Codes Service

Service class for Code management with business logic.
"""

import logging
import secrets
import string
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from uuid import uuid4

from sqlalchemy import select, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Code,
    Context,
    ContextRole,
    NestedContext,
    CodeAccessType,
    CodeStatus,
    CodeRole,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_CODE_GENERATION_ATTEMPTS = 10


# ─────────────────────────────────────────────────────────────────────────────
# Code Generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_code_string() -> str:
    """
    Generate a unique code string in format KIN-XXXXXX-XXX.
    
    Format: KIN-<3 uppercase letters><3 digits>-<3 uppercase letters>
    Example: KIN-ABC123-XYZ
    """
    part1 = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(3))
    part2 = ''.join(secrets.choice(string.digits) for _ in range(3))
    part3 = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(3))
    return f"KIN-{part1}{part2}-{part3}"


async def generate_unique_code(db: AsyncSession) -> str:
    """
    Generate a unique code that doesn't exist in the database.
    
    Retries up to MAX_CODE_GENERATION_ATTEMPTS times.
    
    Raises:
        ValueError: If unable to generate a unique code after max attempts
    """
    for attempt in range(MAX_CODE_GENERATION_ATTEMPTS):
        code = generate_code_string()
        
        # Check if code exists
        result = await db.execute(
            select(Code).where(Code.code == code)
        )
        if not result.scalar_one_or_none():
            logger.debug(f"Generated unique code on attempt {attempt + 1}: {code}")
            return code
    
    raise ValueError(
        f"Failed to generate unique code after {MAX_CODE_GENERATION_ATTEMPTS} attempts"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Service Class
# ─────────────────────────────────────────────────────────────────────────────


class CodeService:
    """Service for managing access codes."""

    async def create(
        self,
        db: AsyncSession,
        context_id: str,
        creator_wallet: str,
        access_type: CodeAccessType = CodeAccessType.CONTEXT,
        gathering_id: Optional[str] = None,
        scope_id: Optional[str] = None,
        role: CodeRole = CodeRole.MEMBER,
        price: Optional[Decimal] = None,
        discount: Optional[Decimal] = None,
        expiry_date: Optional[datetime] = None,
        max_uses: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a new access code."""
        
        # Verify context exists
        result = await db.execute(select(Context).where(Context.id == context_id))
        context = result.scalar_one_or_none()
        if not context:
            raise ValueError("Context not found")
        
        # Validate gathering_id for gathering access type
        if access_type == CodeAccessType.GATHERING:
            if not gathering_id:
                raise ValueError("gathering_id is required when access_type is 'gathering'")
            
            # Verify gathering exists and belongs to context
            result = await db.execute(
                select(NestedContext).where(
                    and_(
                        NestedContext.id == gathering_id,
                        NestedContext.context_id == context_id,
                    )
                )
            )
            if not result.scalar_one_or_none():
                raise ValueError("Gathering not found or does not belong to the specified context")
        elif gathering_id:
            raise ValueError("gathering_id must be null when access_type is 'context'")
        
        # Validate scope_id if provided (references context_roles table)
        if scope_id:
            result = await db.execute(
                select(ContextRole).where(
                    and_(
                        ContextRole.id == scope_id,
                        ContextRole.context_id == context_id,
                    )
                )
            )
            if not result.scalar_one_or_none():
                raise ValueError("Scope not found or does not belong to the specified context")
        
        # Generate unique code
        code_string = await generate_unique_code(db)
        
        code_id = str(uuid4())
        code = Code(
            id=code_id,
            code=code_string,
            access_type=access_type,
            context_id=context_id,
            gathering_id=gathering_id,
            scope_id=scope_id,
            role=role,
            price=price,
            discount=discount,
            expiry_date=expiry_date,
            max_uses=max_uses,
            current_uses=0,
            is_active=True,
            status=CodeStatus.ACTIVE,
            creator_wallet=creator_wallet,
        )
        
        db.add(code)
        await db.commit()
        await db.refresh(code)
        
        logger.info(f"Code created: {code_string} ({code_id}) for context {context_id}")
        return await self._format_code_response(db, code)

    async def get_by_id(
        self,
        db: AsyncSession,
        code_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a code by ID with related entity details."""
        result = await db.execute(
            select(Code).where(Code.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            return None
        return await self._format_code_response(db, code)

    async def get_by_code(
        self,
        db: AsyncSession,
        code_string: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a code by its code string."""
        result = await db.execute(
            select(Code).where(Code.code == code_string.upper())
        )
        code = result.scalar_one_or_none()
        if not code:
            return None
        return await self._format_code_response(db, code)

    async def list_all(
        self,
        db: AsyncSession,
        context_id: Optional[str] = None,
        gathering_id: Optional[str] = None,
        scope_id: Optional[str] = None,
        access_type: Optional[CodeAccessType] = None,
        role: Optional[CodeRole] = None,
        status: Optional[CodeStatus] = None,
        is_active: Optional[bool] = None,
        creator_wallet: Optional[str] = None,
        page: int = 1,
        limit: int = 10,
    ) -> Dict[str, Any]:
        """List codes with optional filters and pagination."""
        from sqlalchemy import func
        
        # Build base query with filters
        query = select(Code)
        count_query = select(func.count(Code.id))
        
        if context_id:
            query = query.where(Code.context_id == context_id)
            count_query = count_query.where(Code.context_id == context_id)
        if gathering_id:
            query = query.where(Code.gathering_id == gathering_id)
            count_query = count_query.where(Code.gathering_id == gathering_id)
        if scope_id:
            query = query.where(Code.scope_id == scope_id)
            count_query = count_query.where(Code.scope_id == scope_id)
        if access_type:
            query = query.where(Code.access_type == access_type)
            count_query = count_query.where(Code.access_type == access_type)
        if role:
            query = query.where(Code.role == role)
            count_query = count_query.where(Code.role == role)
        if status:
            query = query.where(Code.status == status)
            count_query = count_query.where(Code.status == status)
        if is_active is not None:
            query = query.where(Code.is_active == is_active)
            count_query = count_query.where(Code.is_active == is_active)
        if creator_wallet:
            query = query.where(Code.creator_wallet == creator_wallet)
            count_query = count_query.where(Code.creator_wallet == creator_wallet)
        
        # Get total count
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # Apply pagination
        offset = (page - 1) * limit
        query = query.order_by(Code.created_at.desc()).offset(offset).limit(limit)
        
        result = await db.execute(query)
        codes = result.scalars().all()
        
        # Calculate total pages
        total_pages = (total + limit - 1) // limit if limit > 0 else 0
        
        return {
            "codes": [await self._format_code_response(db, c) for c in codes],
            "count": len(codes),
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }

    async def update(
        self,
        db: AsyncSession,
        code_id: str,
        **kwargs,
    ) -> Optional[Dict[str, Any]]:
        """Update a code."""
        result = await db.execute(
            select(Code).where(Code.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            return None
        
        # Validate gathering_id if being updated
        if "gathering_id" in kwargs and kwargs["gathering_id"]:
            result = await db.execute(
                select(NestedContext).where(
                    and_(
                        NestedContext.id == kwargs["gathering_id"],
                        NestedContext.context_id == code.context_id,
                    )
                )
            )
            if not result.scalar_one_or_none():
                raise ValueError("Gathering not found or does not belong to the context")
        
        # Validate scope_id if being updated (references context_roles table)
        if "scope_id" in kwargs and kwargs["scope_id"]:
            result = await db.execute(
                select(ContextRole).where(
                    and_(
                        ContextRole.id == kwargs["scope_id"],
                        ContextRole.context_id == code.context_id,
                    )
                )
            )
            if not result.scalar_one_or_none():
                raise ValueError("Scope not found or does not belong to the context")
        
        # Update fields
        for key, value in kwargs.items():
            if value is not None and hasattr(code, key):
                setattr(code, key, value)
        
        code.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(code)
        
        logger.info(f"Code updated: {code.code} ({code_id})")
        return await self._format_code_response(db, code)

    async def delete(
        self,
        db: AsyncSession,
        code_id: str,
    ) -> bool:
        """Delete a code."""
        result = await db.execute(
            delete(Code).where(Code.id == code_id)
        )
        await db.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"Code deleted: {code_id}")
        return deleted

    async def toggle_active(
        self,
        db: AsyncSession,
        code_id: str,
        is_active: bool,
    ) -> Optional[Dict[str, Any]]:
        """Toggle code active status."""
        result = await db.execute(
            select(Code).where(Code.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            return None
        
        code.is_active = is_active
        # Also update status field
        if is_active:
            code.status = CodeStatus.ACTIVE
        else:
            code.status = CodeStatus.DISABLED
        code.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(code)
        
        logger.info(f"Code {'activated' if is_active else 'deactivated'}: {code.code} ({code_id})")
        return await self._format_code_response(db, code)

    async def validate(
        self,
        db: AsyncSession,
        code_string: str,
    ) -> Dict[str, Any]:
        """
        Validate a code and return its access details.
        
        Returns validation result with:
        - valid: bool
        - Access details if valid
        - Reason if invalid
        """
        result = await db.execute(
            select(Code).where(Code.code == code_string.upper())
        )
        code = result.scalar_one_or_none()
        
        if not code:
            return {"valid": False, "reason": "Code not found"}
        
        # Check if active
        if not code.is_active:
            return {"valid": False, "code": code.code, "reason": "Code is disabled"}
        
        # Check status
        if code.status != CodeStatus.ACTIVE:
            return {"valid": False, "code": code.code, "reason": f"Code status is {code.status.value}"}
        
        # Check expiry
        if code.expiry_date and code.expiry_date < datetime.utcnow():
            return {"valid": False, "code": code.code, "reason": "Code has expired"}
        
        # Check usage limit
        if code.max_uses and code.current_uses >= code.max_uses:
            return {"valid": False, "code": code.code, "reason": "Code has reached maximum uses"}
        
        # Fetch related entities for names
        context_name = None
        gathering_name = None
        scope_name = None
        
        if code.context_id:
            result = await db.execute(select(Context).where(Context.id == code.context_id))
            context = result.scalar_one_or_none()
            if context:
                context_name = context.name
        
        if code.gathering_id:
            result = await db.execute(select(NestedContext).where(NestedContext.id == code.gathering_id))
            gathering = result.scalar_one_or_none()
            if gathering:
                gathering_name = gathering.name
        
        if code.scope_id:
            result = await db.execute(select(ContextRole).where(ContextRole.id == code.scope_id))
            scope = result.scalar_one_or_none()
            if scope:
                scope_name = scope.name
        
        return {
            "valid": True,
            "code": code.code,
            "access_type": code.access_type,
            "context_id": code.context_id,
            "gathering_id": code.gathering_id,
            "scope_id": code.scope_id,
            "role": code.role,
            "context_name": context_name,
            "gathering_name": gathering_name,
            "scope_name": scope_name,
        }

    async def redeem(
        self,
        db: AsyncSession,
        code_string: str,
        wallet: str,
    ) -> Dict[str, Any]:
        """
        Redeem a code for a wallet.
        
        Increments usage count and returns access details.
        """
        # First validate
        validation = await self.validate(db, code_string)
        if not validation["valid"]:
            return {
                "success": False,
                "code": code_string.upper(),
                "reason": validation.get("reason", "Invalid code"),
            }
        
        # Get the code and increment usage
        result = await db.execute(
            select(Code).where(Code.code == code_string.upper())
        )
        code = result.scalar_one_or_none()
        
        code.current_uses += 1
        
        # Check if this was the last use
        if code.max_uses and code.current_uses >= code.max_uses:
            code.status = CodeStatus.REDEEMED
        
        code.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(code)
        
        logger.info(f"Code redeemed: {code.code} by wallet {wallet} (uses: {code.current_uses}/{code.max_uses or 'unlimited'})")
        
        return {
            "success": True,
            "code": code.code,
            "access_type": code.access_type,
            "context_id": code.context_id,
            "gathering_id": code.gathering_id,
            "scope_id": code.scope_id,
            "role": code.role,
            "current_uses": code.current_uses,
            "max_uses": code.max_uses,
        }

    async def _format_code_response(
        self,
        db: AsyncSession,
        code: Code,
    ) -> Dict[str, Any]:
        """Format code with related entity data."""
        
        # Fetch context
        context_data = None
        if code.context_id:
            result = await db.execute(select(Context).where(Context.id == code.context_id))
            context = result.scalar_one_or_none()
            if context:
                context_data = {
                    "id": context.id,
                    "name": context.name,
                    "slug": context.slug,
                }
        
        # Fetch gathering
        gathering_data = None
        if code.gathering_id:
            result = await db.execute(select(NestedContext).where(NestedContext.id == code.gathering_id))
            gathering = result.scalar_one_or_none()
            if gathering:
                gathering_data = {
                    "id": gathering.id,
                    "name": gathering.name,
                    "slug": gathering.slug,
                }
        
        # Fetch scope (from context_roles table)
        scope_data = None
        if code.scope_id:
            result = await db.execute(select(ContextRole).where(ContextRole.id == code.scope_id))
            scope = result.scalar_one_or_none()
            if scope:
                scope_data = {
                    "id": scope.id,
                    "name": scope.name,
                }
        
        return {
            "id": code.id,
            "code": code.code,
            "access_type": code.access_type,
            "context_id": code.context_id,
            "gathering_id": code.gathering_id,
            "scope_id": code.scope_id,
            "role": code.role,
            "price": code.price,
            "discount": code.discount,
            "expiry_date": code.expiry_date,
            "max_uses": code.max_uses,
            "current_uses": code.current_uses,
            "is_active": code.is_active,
            "status": code.status,
            "creator_wallet": code.creator_wallet,
            "created_at": code.created_at,
            "updated_at": code.updated_at,
            "context": context_data,
            "gathering": gathering_data,
            "scope": scope_data,
        }

    async def send_invite_email(
        self,
        db: AsyncSession,
        code_id: str,
        recipient_name: str,
        recipient_email: str,
        personal_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send an invitation email with the access code.
        
        Uses SendGrid to deliver the email.
        """
        import os
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        # Get the code
        result = await db.execute(
            select(Code).where(Code.id == code_id)
        )
        code = result.scalar_one_or_none()
        if not code:
            raise ValueError("Code not found")
        
        # Check if code is active
        if not code.is_active or code.status != CodeStatus.ACTIVE:
            raise ValueError("Cannot send invite for inactive or disabled code")
        
        # Get context name
        context_name = "Kinship"
        if code.context_id:
            result = await db.execute(select(Context).where(Context.id == code.context_id))
            context = result.scalar_one_or_none()
            if context:
                context_name = context.name
        
        # Build email content
        subject = f"You've been invited to join {context_name}!"
        
        # Format expiry date
        expiry_text = ""
        if code.expiry_date:
            expiry_text = f"<p><strong>Expires:</strong> {code.expiry_date.strftime('%B %d, %Y')}</p>"
        
        # Build HTML content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
                .code-box {{ background: #1f2937; color: #f59e0b; font-size: 24px; font-weight: bold; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; letter-spacing: 2px; }}
                .message {{ background: white; padding: 15px; border-left: 4px solid #6366f1; margin: 20px 0; border-radius: 4px; }}
                .details {{ background: white; padding: 15px; border-radius: 8px; margin: 20px 0; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 You're Invited!</h1>
                    <p>Join {context_name}</p>
                </div>
                <div class="content">
                    <p>Hi {recipient_name},</p>
                    
                    {"<div class='message'><p>" + personal_message + "</p></div>" if personal_message else ""}
                    
                    <p>You've been invited to join <strong>{context_name}</strong> as a <strong>{code.role.value.title()}</strong>.</p>
                    
                    <p>Use this invitation code to get access:</p>
                    
                    <div class="code-box">
                        {code.code}
                    </div>
                    
                    <div class="details">
                        <p><strong>Access Type:</strong> {code.access_type.value.title()}</p>
                        <p><strong>Role:</strong> {code.role.value.title()}</p>
                        {expiry_text}
                    </div>
                    
                    <p>Click below to redeem your invitation:</p>
                    <p style="text-align: center;">
                        <a href="https://kinship.app/redeem?code={code.code}" 
                           style="background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            Redeem Invitation
                        </a>
                    </p>
                </div>
                <div class="footer">
                    <p>This invitation was sent via Kinship.</p>
                    <p>If you didn't expect this email, you can safely ignore it.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Send via SendGrid
        sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
        if not sendgrid_api_key:
            raise ValueError("SendGrid API key not configured")
        
        # Get sender email from environment (must be verified in SendGrid)
        sender_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@kinship.app")
        sender_name = os.getenv("SENDGRID_FROM_NAME", "Kinship")
        
        message = Mail(
            from_email=Email(sender_email, sender_name),
            to_emails=To(recipient_email, recipient_name),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        
        try:
            sg = SendGridAPIClient(sendgrid_api_key)
            response = sg.send(message)
            
            logger.info(f"Invite email sent for code {code.code} to {recipient_email}, status: {response.status_code}")
            
            return {
                "success": True,
                "message": f"Invitation sent to {recipient_email}",
                "code": code.code,
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
            }
        except Exception as e:
            logger.error(f"Failed to send invite email: {str(e)}")
            error_msg = str(e)
            if "403" in error_msg or "Forbidden" in error_msg:
                raise ValueError(
                    f"Sender email '{sender_email}' is not verified in SendGrid. "
                    "Please verify a Single Sender at https://app.sendgrid.com/settings/sender_auth/senders "
                    "and set SENDGRID_FROM_EMAIL in your .env file."
                )
            raise ValueError(f"Failed to send email: {error_msg}")


# Singleton instance
code_service = CodeService()