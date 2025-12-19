"""Multi-Agent Dependency Injection Container"""

import os
from dependency_injector import containers, providers
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver

from app.domains.multi_agent.services.agents.notion.mcp_client import NotionMCPClient
from app.domains.multi_agent.services.agents.clickup.mcp_client import ClickUpMCPClient
from app.domains.multi_agent.handlers.chat_handler import MultiAgentChatHandler
from app.domains.clickup_demo.repositories import SessionRepository, ChatRepository
from app.domains.clickup_demo.services.agent.langfuse_handler import LangFuseHandler
from app.common.database.mongodb import get_database


class MultiAgentContainer(containers.DeclarativeContainer):
    """Multi-Agent 의존성 주입 컨테이너"""

    # Configuration
    config = providers.Configuration()

    # Memory Saver (Singleton - 모든 대화에서 공유)
    memory_saver = providers.Singleton(MemorySaver)

    # LLM (Singleton - OpenRouter를 통한 모델 접근)
    llm = providers.Singleton(
        ChatOpenAI,
        model="google/gemini-2.5-flash",  # OpenRouter 모델 ID
        temperature=0.7,
        api_key=providers.Callable(lambda: os.environ.get("OPENROUTER_API_KEY")),
        base_url="https://openrouter.ai/api/v1",
    )

    # Notion MCP Client (Singleton)
    notion_mcp_client = providers.Singleton(
        NotionMCPClient,
        notion_token=providers.Callable(lambda: os.environ.get("NOTION_TOKEN")),
    )

    # ClickUp MCP Client (Singleton)
    clickup_mcp_client = providers.Singleton(
        ClickUpMCPClient,
        clickup_token=providers.Callable(lambda: os.environ.get("CLICKUP_ACCESS_TOKEN")),
    )

    # MongoDB Database
    database = providers.Callable(get_database)

    # Repositories
    session_repository = providers.Factory(SessionRepository, db=database)
    chat_repository = providers.Factory(ChatRepository, db=database)

    # Chat Handler
    chat_handler = providers.Factory(
        MultiAgentChatHandler,
        session_repository=session_repository,
        chat_repository=chat_repository,
    )

    # LangFuse Handler (Singleton - 환경변수에서 자동으로 설정 로드)
    langfuse_handler = providers.Singleton(LangFuseHandler)
