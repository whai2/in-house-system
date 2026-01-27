"""Neo4j Knowledge Graph Service - Cypher 쿼리 관리"""

import logging
from typing import Optional, List
from neo4j import AsyncDriver

logger = logging.getLogger(__name__)


class Neo4jKnowledgeGraphService:
    """Neo4j 기반 지식 그래프 서비스

    모든 그래프 CRUD 작업을 캡슐화합니다.
    MERGE: Topics, Keywords, Agents, Tools (멱등성)
    CREATE: Queries, ToolExecutions (매 이벤트 고유)

    모든 메서드는 try/except로 감싸여 있으며,
    fire-and-forget 사용을 위해 예외를 전파하지 않습니다.
    """

    def __init__(self, driver: AsyncDriver):
        self.driver = driver

    async def create_query_node(
        self,
        query_id: str,
        text: str,
        conversation_id: str,
        intent: Optional[str] = None,
        gatekeeper_verdict: str = "STORE",
    ) -> None:
        """Query 노드 생성"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    CREATE (q:Query {
                        query_id: $query_id,
                        text: $text,
                        conversation_id: $conversation_id,
                        intent: $intent,
                        gatekeeper_verdict: $gatekeeper_verdict,
                        status: 'processing',
                        created_at: datetime()
                    })
                    """,
                    {
                        "query_id": query_id,
                        "text": text,
                        "conversation_id": conversation_id,
                        "intent": intent,
                        "gatekeeper_verdict": gatekeeper_verdict,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to create query node: {e}")

    async def update_query_intent(
        self,
        query_id: str,
        intent: str,
    ) -> None:
        """Query 노드의 intent 업데이트"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    SET q.intent = $intent
                    """,
                    {"query_id": query_id, "intent": intent},
                )
        except Exception as e:
            logger.error(f"Failed to update query intent: {e}")

    async def link_topics(
        self,
        query_id: str,
        topics: List[str],
    ) -> None:
        """Query에 Topic 노드들을 MERGE하고 연결"""
        try:
            async with self.driver.session() as session:
                # Topic 노드 생성 및 연결
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    UNWIND $topics AS topic_name
                    MERGE (t:Topic {name: topic_name})
                    ON CREATE SET t.created_at = datetime()
                    MERGE (q)-[:HAS_TOPIC]->(t)
                    """,
                    {"query_id": query_id, "topics": topics},
                )
                # Topic 간 co-occurrence 관계 업데이트
                if len(topics) > 1:
                    await session.run(
                        """
                        MATCH (q:Query {query_id: $query_id})-[:HAS_TOPIC]->(t1:Topic)
                        MATCH (q)-[:HAS_TOPIC]->(t2:Topic)
                        WHERE id(t1) < id(t2)
                        MERGE (t1)-[r:RELATED_TO]-(t2)
                        ON CREATE SET r.co_occurrence_count = 1
                        ON MATCH SET r.co_occurrence_count = r.co_occurrence_count + 1
                        """,
                        {"query_id": query_id},
                    )
        except Exception as e:
            logger.error(f"Failed to link topics: {e}")

    async def link_keywords(
        self,
        query_id: str,
        keywords: List[str],
    ) -> None:
        """Query에 Keyword 노드들을 MERGE하고 연결"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    UNWIND $keywords AS kw_name
                    MERGE (k:Keyword {name: kw_name})
                    ON CREATE SET k.created_at = datetime()
                    MERGE (q)-[:HAS_KEYWORD]->(k)
                    """,
                    {"query_id": query_id, "keywords": keywords},
                )
        except Exception as e:
            logger.error(f"Failed to link keywords: {e}")

    async def record_routing(
        self,
        query_id: str,
        agent_name: str,
        order: int,
    ) -> None:
        """Query가 Agent에 라우팅된 것을 기록"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    MERGE (a:Agent {name: $agent_name})
                    ON CREATE SET a.created_at = datetime()
                    MERGE (q)-[r:ROUTED_TO]->(a)
                    SET r.order = $order, r.timestamp = datetime()
                    """,
                    {
                        "query_id": query_id,
                        "agent_name": agent_name,
                        "order": order,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to record routing: {e}")

    async def record_tool_execution(
        self,
        query_id: str,
        execution_id: str,
        tool_name: str,
        agent_name: str,
        input_summary: str = "",
        output_summary: str = "",
        success: bool = True,
    ) -> None:
        """Tool 실행 이벤트 기록"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    MERGE (tool:Tool {name: $tool_name})
                    ON CREATE SET tool.created_at = datetime()
                    MERGE (a:Agent {name: $agent_name})
                    ON CREATE SET a.created_at = datetime()
                    MERGE (tool)-[:BELONGS_TO]->(a)
                    CREATE (te:ToolExecution {
                        execution_id: $execution_id,
                        tool_name: $tool_name,
                        agent_name: $agent_name,
                        input_summary: $input_summary,
                        output_summary: $output_summary,
                        success: $success,
                        created_at: datetime()
                    })
                    MERGE (q)-[:EXECUTED]->(te)
                    MERGE (te)-[:USED_TOOL]->(tool)
                    """,
                    {
                        "query_id": query_id,
                        "execution_id": execution_id,
                        "tool_name": tool_name,
                        "agent_name": agent_name,
                        "input_summary": input_summary,
                        "output_summary": output_summary,
                        "success": success,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to record tool execution: {e}")

    async def complete_query(
        self,
        query_id: str,
        response_summary: str = "",
    ) -> None:
        """Query 완료 상태로 업데이트"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (q:Query {query_id: $query_id})
                    SET q.status = 'completed',
                        q.completed_at = datetime(),
                        q.response_summary = $response_summary
                    """,
                    {
                        "query_id": query_id,
                        "response_summary": response_summary,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to complete query: {e}")

    async def link_query_chain(
        self,
        query_id: str,
        conversation_id: str,
    ) -> None:
        """같은 conversation 내에서 이전 Query와 FOLLOWED_BY 관계 연결"""
        try:
            async with self.driver.session() as session:
                await session.run(
                    """
                    MATCH (current:Query {query_id: $query_id})
                    OPTIONAL MATCH (prev:Query {conversation_id: $conversation_id})
                    WHERE prev.query_id <> $query_id
                      AND prev.created_at < current.created_at
                    WITH current, prev
                    ORDER BY prev.created_at DESC
                    LIMIT 1
                    FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
                        MERGE (prev)-[:FOLLOWED_BY]->(current)
                    )
                    """,
                    {
                        "query_id": query_id,
                        "conversation_id": conversation_id,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to link query chain: {e}")
