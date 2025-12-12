"""ClickUp Demo Dependency Injection Container"""

import os
from dependency_injector import containers, providers
from langchain_anthropic import ChatAnthropic
from langgraph.checkpoint.memory import MemorySaver

from app.domains.clickup_demo.services.agent.mcp_client import ClickUpMCPClient
from app.domains.clickup_demo.services.agent.agent import ClickUpAgent


class ClickUpDemoContainer(containers.DeclarativeContainer):
    """ClickUp Demo 의존성 주입 컨테이너"""

    # Configuration
    config = providers.Configuration()

    # Memory Saver (Singleton - 모든 대화에서 공유)
    memory_saver = providers.Singleton(MemorySaver)

    # LLM (Singleton - 재사용)
    llm = providers.Singleton(
        ChatAnthropic,
        model="claude-opus-4-5-20251101",
        temperature=0.7,
        api_key=providers.Callable(lambda: os.environ.get("ANTHROPIC_API_KEY")),
    )

    # ClickUp MCP Client (Singleton - MCP 서버 연결 공유)
    mcp_client = providers.Singleton(
        ClickUpMCPClient,
        clickup_token=providers.Callable(lambda: os.environ.get("CLICKUP_ACCESS_TOKEN")),
    )

    # ClickUp Agent (Singleton - MCP 세션 및 도구 재사용)
    clickup_agent = providers.Singleton(
        ClickUpAgent,
        llm=llm,
        mcp_client=mcp_client,
        memory_saver=memory_saver,
    )
