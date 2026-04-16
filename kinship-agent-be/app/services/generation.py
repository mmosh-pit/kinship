"""
Kinship Agent - AI Content Generation Service

Provides AI-powered content generation for agent descriptions and backstories.
"""

import httpx
from typing import Literal, Optional

from app.core.config import settings


class GenerationService:
    """Service for AI-powered content generation."""

    def __init__(self):
        self.api_key = settings.anthropic_api_key
        self.model = settings.anthropic_model or "claude-sonnet-4-20250514"
        self.api_url = "https://api.anthropic.com/v1/messages"

    async def generate_agent_content(
        self,
        target: Literal["description", "backstory"],
        instructions: str,
        mode: Literal["generate", "refine"] = "generate",
        agent_name: str = "",
        brief_description: Optional[str] = None,
        current_description: Optional[str] = None,
        current_backstory: Optional[str] = None,
    ) -> str:
        """
        Generate or refine agent description or backstory.

        Args:
            target: What to generate - "description" or "backstory"
            instructions: User's instructions for the generation
            mode: "generate" for new content, "refine" to improve existing
            agent_name: Name of the agent
            brief_description: Short description of the agent
            current_description: Existing description (for refine mode or backstory context)
            current_backstory: Existing backstory (for refine mode)

        Returns:
            Generated content string
        """
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")

        # Build context
        context_parts = [
            f"Agent name: {agent_name}",
        ]
        if brief_description:
            context_parts.append(f"Brief description: {brief_description}")
        if target == "backstory" and current_description:
            context_parts.append(f"Appearance description: {current_description}")

        context = "\n".join(context_parts)

        # Build prompts based on target and mode
        if target == "description":
            if mode == "refine" and current_description:
                system_prompt = (
                    "You are a creative writer specializing in character and entity descriptions. "
                    "Given context about an agent/presence/being, refine and improve an existing description "
                    "based on user instructions. The agent could be anything — human, animal, mythical creature, "
                    "elemental force, abstract entity, etc. Adapt your language and structure accordingly. "
                    "Return only the updated description text — no headings, no markdown fences, no commentary."
                )
                user_message = (
                    f"{context}\n\n"
                    f"Current description:\n{current_description}\n\n"
                    f"Refinement instructions: {instructions}"
                )
            else:
                system_prompt = (
                    "You are a creative writer specializing in character and entity descriptions. "
                    "Given context about an agent/presence/being, write a rich, vivid description. "
                    "The agent could be anything — human, animal, mythical creature, elemental force, "
                    "abstract entity, etc. Adapt what you describe to fit the nature of the being. "
                    "Return only the description text — no headings, no markdown fences, no commentary. "
                    "2–4 paragraphs."
                )
                user_message = f"{context}\n\nInstructions: {instructions}"
        else:
            # backstory
            if mode == "refine" and current_backstory:
                system_prompt = (
                    "You are a creative writer specializing in character backstories and lore. "
                    "Refine and improve an existing backstory based on user instructions. "
                    "Return only the updated backstory text — no headings, no markdown fences, no commentary."
                )
                user_message = (
                    f"{context}\n\n"
                    f"Current backstory:\n{current_backstory}\n\n"
                    f"Refinement instructions: {instructions}"
                )
            else:
                system_prompt = (
                    "You are a creative writer specializing in character backstories and lore. "
                    "Given context about an agent/presence/being, write an engaging backstory — origins, "
                    "history, motivations, and defining moments. Adapt the storytelling to fit the nature "
                    "of the being. Return only the backstory text — no headings, no markdown fences, "
                    "no commentary. 2–4 paragraphs."
                )
                user_message = f"{context}\n\nInstructions: {instructions}"

        # Call Anthropic API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.api_url,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )

            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"AI generation failed: {error_text}")

            data = response.json()
            return data["content"][0]["text"].strip()


# Singleton instance
generation_service = GenerationService()
