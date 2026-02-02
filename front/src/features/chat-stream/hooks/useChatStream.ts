import type { ChatMessage } from "@/entities/chat";
import { generateUUID } from "@/shared/lib/uuid";
import type { StreamEvent } from "@/shared/types/stream";
import { useCallback } from "react";
import { ChatStreamApi } from "../api/chatStreamApi";

interface UseChatStreamOptions {
  onEvent?: (event: StreamEvent) => void;
  onMessage?: (message: ChatMessage) => string; // 실제 생성된 messageId 반환
  onMessageUpdate?: (
    messageId: string,
    content: string,
    isStreaming?: boolean
  ) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export const useChatStream = () => {
  const streamChat = useCallback(
    async (
      message: string,
      conversationId: string | undefined,
      options: UseChatStreamOptions = {}
    ) => {
      const { onEvent, onMessage, onMessageUpdate, onError, onComplete } =
        options;
      const streamApi = new ChatStreamApi();

      // 노드별 스트리밍 메시지 ID 추적
      const nodeMessageMap = new Map<string, string>();
      // 현재 활성화된 message_chunk 메시지 ID (nodeName -> messageId)
      const activeChunkMessageMap = new Map<string, string>();

      try {
        const request = {
          message: message.trim(),
          ...(conversationId && { conversation_id: conversationId }),
        };

        for await (const event of streamApi.streamChat(request)) {
          onEvent?.(event);

          // message_chunk 처리: node_end 전까지 같은 메시지에 누적
          if (event.event_type === "message_chunk") {
            const nodeName = event.node_name || "default";
            const chunkContent = event.data?.text || event.content || event.data?.content || "";

            if (!chunkContent) {
              continue;
            }

            // 현재 활성화된 메시지가 있는지 확인
            const activeMessageId = activeChunkMessageMap.get(nodeName);

            if (activeMessageId) {
              // 기존 메시지에 누적
              onMessageUpdate?.(activeMessageId, chunkContent);
            } else {
              // 새 메시지 생성 (node_end 이후 첫 chunk)
              const newMessage: ChatMessage = {
                id: generateUUID(),
                role: "assistant",
                content: chunkContent,
                timestamp: Date.now(),
                isStreaming: true,
                metadata: {
                  eventType: "message_chunk",
                  nodeName: event.node_name,
                },
              };
              const actualMessageId = onMessage?.(newMessage);

              // 활성 메시지로 등록
              if (actualMessageId) {
                activeChunkMessageMap.set(nodeName, actualMessageId);
              }
            }
            continue;
          }

          // 다른 이벤트 타입 처리
          const result = convertEventToMessage(event, nodeMessageMap, activeChunkMessageMap);
          if (result) {
            if (result.type === "new") {
              // 새 메시지 생성
              const actualMessageId = onMessage?.(result.message);

              // 실제 생성된 messageId를 nodeMessageMap에 저장
              if (actualMessageId && result.message.metadata?.nodeName) {
                nodeMessageMap.set(
                  result.message.metadata.nodeName,
                  actualMessageId
                );
              }
            } else if (result.type === "update") {
              // 기존 메시지 업데이트
              onMessageUpdate?.(
                result.messageId,
                result.content,
                result.isStreaming
              );
            }
          }
        }

        onComplete?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);

        // 에러 메시지도 ChatMessage로 변환
        const errorMessage: ChatMessage = {
          id: generateUUID(),
          role: "assistant",
          content: `에러 발생: ${err.message}`,
          timestamp: Date.now(),
          isStreaming: false,
          metadata: {
            eventType: "error",
          },
        };
        onMessage?.(errorMessage);
      }
    },
    []
  );

  return { streamChat };
};

// 변환 결과 타입
type ConvertResult =
  | { type: "new"; message: ChatMessage }
  | {
      type: "update";
      messageId: string;
      content: string;
      isStreaming?: boolean;
    }
  | null;

// StreamEvent를 ChatMessage로 변환하는 함수
function convertEventToMessage(
  event: StreamEvent,
  nodeMessageMap: Map<string, string>,
  chunkMessageMap: Map<string, string>
): ConvertResult {
  const messageId = generateUUID();
  const timestamp = Date.now();

  switch (event.event_type) {
    case "final": {
      // 최종 응답: assistant_message는 이미 chunk로 왔으므로 로그만 보고
      const data = event.data || {};
      const executionLogs = data.execution_logs || [];
      const nodeSequence = data.node_sequence || [];
      const usedTools = data.used_tools || [];
      const toolUsageCount = data.tool_usage_count || 0;

      let logContent = "📊 실행 완료\n\n";
      logContent += `**실행된 노드**: ${nodeSequence.join(" → ")}\n\n`;

      if (executionLogs.length > 0) {
        logContent += "**실행 로그**:\n";
        executionLogs.forEach((log: any) => {
          logContent += `- ${log.node} (반복: ${log.iteration})`;
          if (log.has_tool_calls) {
            logContent += " - 도구 사용됨";
          }
          if (log.is_final) {
            logContent += " - 최종";
          }
          logContent += "\n";
        });
        logContent += "\n";
      }

      if (toolUsageCount > 0) {
        logContent += `**사용된 도구 수**: ${toolUsageCount}\n`;
        if (usedTools.length > 0) {
          logContent += `**도구 목록**: ${usedTools.join(", ")}\n`;
        }
      }

      // 로그 메시지 생성 (assistant_message는 이미 chunk로 표시됨)
      return {
        type: "new",
        message: {
          id: messageId,
          role: "assistant",
          content: logContent,
          timestamp,
          isStreaming: false,
          metadata: {
            eventType: "final",
            nodeName: event.node_name,
            iteration: event.iteration,
            isCollapsible: true, // 접을 수 있는 메시지로 표시
          },
        },
      };
    }

    case "node_start": {
      // 노드 시작: 스트리밍 메시지 생성
      const _nodeName = event.node_name || "알 수 없는 노드";
      void _nodeName; // suppress unused variable warning
      const streamingMessage: ChatMessage = {
        id: messageId,
        role: "assistant",
        content: "", // 빈 content로 시작, message_chunk로 채워짐
        timestamp,
        isStreaming: true,
        metadata: {
          eventType: "node_start",
          nodeName: event.node_name,
          iteration: event.iteration,
        },
      };

      // 노드 이름으로 메시지 ID 저장
      if (event.node_name) {
        nodeMessageMap.set(event.node_name, messageId);
      }

      return {
        type: "new",
        message: streamingMessage,
      };
    }

    case "tool_result": {
      // 도구 실행 결과 메시지
      const toolResult = formatToolResult(event.data || {});
      return {
        type: "new",
        message: {
          id: messageId,
          role: "assistant",
          content: `🔧 도구 실행 결과:\n${toolResult}`,
          timestamp,
          isStreaming: true,
          metadata: {
            eventType: "tool_result",
            nodeName: event.node_name,
            iteration: event.iteration,
          },
        },
      };
    }

    case "node_end":
    case "REASON_END": {
      // 노드 완료: 현재 활성화된 chunk 메시지 종료 및 제거
      const nodeName = event.node_name || "default";
      const activeMessageId = chunkMessageMap.get(nodeName);

      if (activeMessageId) {
        // 활성 메시지 목록에서 제거 (다음 message_chunk가 새 메시지를 생성하도록)
        chunkMessageMap.delete(nodeName);

        return {
          type: "update",
          messageId: activeMessageId,
          content: "", // content는 변경하지 않음
          isStreaming: false, // 스트리밍 종료
        };
      }
      return null;
    }

    case "error": {
      // 에러 메시지
      const errorContent = event.data?.error
        ? String(event.data.error)
        : "알 수 없는 에러가 발생했습니다.";
      return {
        type: "new",
        message: {
          id: messageId,
          role: "assistant",
          content: `❌ 에러: ${errorContent}`,
          timestamp,
          isStreaming: false,
          metadata: {
            eventType: "error",
            nodeName: event.node_name,
            iteration: event.iteration,
          },
        },
      };
    }

    case "message_chunk":
      // message_chunk는 위에서 처리됨
      return null;

    default:
      return null;
  }
}

// 도구 실행 결과 포맷팅
function formatToolResult(data: Record<string, any>): string {
  if (!data || typeof data !== "object") {
    return "결과 없음";
  }

  // 간단한 문자열이면 그대로 반환
  if (typeof data === "string") {
    return data;
  }

  // JSON으로 포맷팅 (너무 길면 요약)
  try {
    const jsonString = JSON.stringify(data, null, 2);
    if (jsonString.length > 500) {
      return jsonString.slice(0, 500) + "\n... (생략)";
    }
    return jsonString;
  } catch {
    return String(data);
  }
}
