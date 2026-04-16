import re
from uuid import uuid4
from datetime import datetime, timedelta

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt.chat_agent_executor import AgentState

import httpx
import json
from typing import AsyncGenerator


from langgraph_workflow import run_agent_streaming
from loguru import logger
from models import QueryRequest
from pipeline._prompts import CHAT_SYSTEM_PROMPT
from pipeline.protocols import Agent
from pipeline.utils import init_chat_model


class VoiceAgent(Agent):
    """This class implements a comprehensive agent for kinship bots.

    Args:
        model : Name of the model default is "gpt-4o-mini"
        provider : Model provider, such as `openai`, `google_genai`, `groq`, default is "openai"
        temperature : Model temperature, default is 0.2
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        temperature: float = 0.2,
    ):
        self.llm = init_chat_model(model, provider, temperature)
        self.agent = self._create_agent()
        self.runnable_config = {"configurable": {"thread_id": uuid4().hex}}



    def _create_agent(self):
        def _prompt(state: AgentState, config: RunnableConfig):
            messages = [
                SystemMessage(CHAT_SYSTEM_PROMPT.strip()),
            ] + state["messages"]
            return messages

        agent = create_react_agent(
            model=self.llm,
            prompt=_prompt,
            tools=[
            ],
            checkpointer=InMemorySaver(),
        )
        return agent

    async def generate(self, message: str) -> str:
        """Generate response using the enhanced airline agent workflow."""
        print("============ CALLED 3 =================")
        result = self.agent.invoke(
            {
                "messages": [
                    HumanMessage(content=message),
                ]
            },
            self.runnable_config,
        )
        return result["messages"][-1].content

    async def generate_stream(
        self, 
        message: str, 
        session_token: str, 
        system_prompt: str, 
        agent_id: str, 
        bot_id: str, 
        user_id: str, 
        wallet: str, 
        aiModel: str
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response using the workflow generator logic directly."""
        try:
            logger.info(f"Starting stream for message: {message}")

            # Build request object
            request_obj = QueryRequest(
                query=message,
                namespaces=["PUBLIC"],
                agentId=agent_id,
                bot_id=bot_id,
                system_prompt=system_prompt,
                instructions=system_prompt,
                userHistory=[],
                chatHistory=[],
                aiModel=aiModel,
            )

            # Stream LangGraph chunks directly
            async for chunk in run_agent_streaming(
                request=request_obj,
                user_id=user_id,
                agent_id=agent_id,
                bot_id=bot_id,
                session_token=f"Bearer {session_token}",
                wallet=wallet,
                chat_history=[],
            ):
                # Check if chunk has content attribute (AIMessageChunk)
                if hasattr(chunk, "content") and chunk.content:
                    content = str(chunk.content)
                    logger.debug(f"Yielding chunk: {content}")
                    yield content

        except Exception as e:
            logger.error(f"Error in generate_stream: {e}")
            import traceback
            traceback.print_exc()
            # Yield error message to client
            yield f"Error: {str(e)}"
