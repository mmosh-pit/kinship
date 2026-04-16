"""
Kinship Agent - File Parser Service

Extracts text from various file formats.
"""

from typing import Tuple
import io


def get_mime_type(filename: str) -> str:
    """
    Get MIME type from filename extension.
    
    Args:
        filename: Name of the file
        
    Returns:
        MIME type string
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    
    mime_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain",
        "md": "text/markdown",
        "csv": "text/csv",
        "json": "application/json",
    }
    
    return mime_types.get(ext, "application/octet-stream")


async def extract_text(content: bytes, mime_type: str) -> str:
    """
    Extract text from file content based on MIME type.
    
    Args:
        content: Raw file bytes
        mime_type: MIME type of the file
        
    Returns:
        Extracted text content
    """
    if mime_type == "application/pdf":
        return await _extract_pdf(content)
    
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await _extract_docx(content)
    
    elif mime_type in ("text/plain", "text/markdown", "text/csv", "application/json"):
        return content.decode("utf-8", errors="replace")
    
    else:
        # Try to decode as text
        try:
            return content.decode("utf-8", errors="replace")
        except Exception:
            return ""


async def _extract_pdf(content: bytes) -> str:
    """Extract text from PDF using pypdf."""
    try:
        from pypdf import PdfReader
        
        reader = PdfReader(io.BytesIO(content))
        text_parts = []
        
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        
        return "\n\n".join(text_parts)
    
    except ImportError:
        # Fallback: try pdf2image + pytesseract if available
        raise ImportError("pypdf is required for PDF extraction. Install with: pip install pypdf")
    except Exception as e:
        raise Exception(f"Failed to extract PDF text: {e}")


async def _extract_docx(content: bytes) -> str:
    """Extract text from DOCX using python-docx."""
    try:
        from docx import Document
        
        doc = Document(io.BytesIO(content))
        text_parts = []
        
        for para in doc.paragraphs:
            if para.text:
                text_parts.append(para.text)
        
        return "\n\n".join(text_parts)
    
    except ImportError:
        raise ImportError("python-docx is required for DOCX extraction. Install with: pip install python-docx")
    except Exception as e:
        raise Exception(f"Failed to extract DOCX text: {e}")


def validate_file(filename: str, max_size_mb: int = 10) -> Tuple[bool, str]:
    """
    Validate if a file is acceptable for upload.
    
    Args:
        filename: Name of the file
        max_size_mb: Maximum file size in MB
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    
    allowed_extensions = {"pdf", "txt", "md", "docx", "csv"}
    
    if ext not in allowed_extensions:
        return False, f"Unsupported file type: .{ext}. Allowed: {', '.join(allowed_extensions)}"
    
    return True, ""
