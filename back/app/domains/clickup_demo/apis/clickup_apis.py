"""ClickUp Demo API Endpoints"""

import json
from uuid import uuid4
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from dependency_injector.wiring import inject, Provide

from app.domains.clickup_demo.models.schemas import (
    ClickUpChatRequest,
    ClickUpChatResponse,
    ToolExecutionDetail,
)
from app.domains.clickup_demo.services.agent.agent import ClickUpAgent
from app.domains.clickup_demo.container.container import ClickUpDemoContainer

clickup_router = APIRouter()


@clickup_router.post("/chat", response_model=ClickUpChatResponse)
@inject
async def clickup_chat(
    request: ClickUpChatRequest,
    agent: ClickUpAgent = Depends(Provide[ClickUpDemoContainer.clickup_agent]),
) -> ClickUpChatResponse:
    """
    ClickUp 작업 관리 채팅 API

    ## 기능
    - ClickUp MCP 서버를 통한 작업 관리
    - Task Management: 작업 생성, 수정, 조회
    - Team & List Operations: 팀 및 리스트 조회
    - Space Management: 스페이스 CRUD
    - Folder & Board Management: 폴더 및 보드 관리
    - Custom Fields: 커스텀 필드 관리
    - Documentation: Docs 검색, 생성, 편집
    - Views: 다양한 뷰 생성 및 관리
    - 자연어 대화형 인터페이스
    - LangGraph ReAct 패턴 기반 자동 도구 선택

    ## 사용 예시
    - "스페이스 목록을 보여줘"
    - "첫 번째 스페이스의 리스트를 조회해줘"
    - "진행 중인 작업들을 보여줘"
    - "'회의 준비'라는 작업을 만들어줘"
    """
    conversation_id = request.conversation_id or str(uuid4())

    # 에이전트 채팅 실행
    result = await agent.chat(
        user_message=request.message,
        conversation_id=conversation_id,
    )

    # 도구 실행 상세 정보 생성
    tool_details = []
    for idx, tool_exec in enumerate(result["tool_history"], start=1):
        tool_details.append(
            ToolExecutionDetail(
                tool_name=tool_exec["tool"],
                args=tool_exec["args"],
                success=tool_exec["success"],
                result_summary=(
                    tool_exec.get("result", "")[:200] if tool_exec["success"] else None
                ),
                error=tool_exec.get("error") if not tool_exec["success"] else None,
                iteration=idx,
            )
        )

    return ClickUpChatResponse(
        conversation_id=result["conversation_id"],
        user_message=request.message,
        assistant_message=result["assistant_message"],
        node_sequence=result["node_sequence"],
        execution_logs=result["execution_logs"],
        used_tools=result["used_tools"],
        tool_usage_count=result["tool_count"],
        tool_details=tool_details,
    )


@clickup_router.post("/chat/stream")
@inject
async def clickup_chat_stream(
    request: ClickUpChatRequest,
    agent: ClickUpAgent = Depends(Provide[ClickUpDemoContainer.clickup_agent]),
):
    """
    ClickUp 작업 관리 채팅 API (스트리밍)

    ## 기능
    - 실시간으로 각 노드 실행 결과를 스트리밍
    - 각 스텝(노드)마다 즉시 결과 반환
    - Server-Sent Events (SSE) 형식으로 스트리밍

    ## 이벤트 타입
    - `node_start`: 노드 실행 시작
    - `node_end`: 노드 실행 완료
    - `tool_result`: 도구 실행 결과
    - `final`: 최종 결과

    ## 사용 예시
    ```javascript
    const eventSource = new EventSource('/clickup/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ message: '스페이스 목록을 보여줘' })
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Event:', data.event_type, data);
    };
    ```
    """
    conversation_id = request.conversation_id or str(uuid4())

    async def generate():
        """스트리밍 이벤트 생성"""
        try:
            async for event in agent.stream_chat(
                user_message=request.message,
                conversation_id=conversation_id,
            ):
                # SSE 형식으로 전송
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            # 에러 발생 시 에러 이벤트 전송
            error_event = {
                "event_type": "error",
                "node_name": None,
                "iteration": None,
                "data": {"error": str(e)},
                "timestamp": 0,
            }
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
        finally:
            # 스트림 종료
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Nginx 버퍼링 비활성화
        },
    )
