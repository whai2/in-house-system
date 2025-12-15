import type { ChatMessage } from "@/entities/chat";
import { useSessionChats } from "@/entities/chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../../shared/store/chatStore";
import { ChatInput, MessagesArea } from "../../shared/ui";
import { useChatStream } from "../chat-stream";
import { MessageDisplay } from "./MessageDisplay";

export const ChatInterface = () => {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    getCurrentConversation,
    addMessage,
    updateMessage,
    appendMessageContent,
    status,
    setStatus,
  } = useChatStore();

  const { streamChat } = useChatStream();
  const currentConversation = getCurrentConversation();

  // 세션 채팅 이력 조회 (리액트 쿼리)
  const {
    data: sessionChatsData,
    isLoading: isLoadingHistory,
    isError: isHistoryError,
  } = useSessionChats(currentConversation?.id || null, { limit: 100 });

  const messages = useMemo(
    () => currentConversation?.messages || [],
    [currentConversation?.messages]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 세션 채팅 이력을 메시지로 변환하여 추가
  useEffect(() => {
    if (
      !currentConversation ||
      !sessionChatsData ||
      currentConversation.messages.length > 0
    ) {
      return; // 이미 메시지가 있으면 불러오지 않음
    }

    // 채팅 이력을 메시지로 변환하여 추가
    for (const chat of sessionChatsData.chats) {
      // 사용자 메시지 추가
      addMessage(currentConversation.id, {
        role: "user",
        content: chat.user_message,
      });

      // 어시스턴트 메시지 추가
      let assistantContent = chat.assistant_message;
      if (chat.tool_details && chat.tool_details.length > 0) {
        assistantContent +=
          "\n\n**사용된 도구**: " + chat.used_tools.join(", ");
      }

      addMessage(currentConversation.id, {
        role: "assistant",
        content: assistantContent,
        isStreaming: false,
        metadata: {
          eventType: "final",
          nodeName: null,
          iteration: null,
        },
      });
    }
  }, [sessionChatsData, currentConversation, addMessage]);

  const handleSubmit = async () => {
    if (!inputValue.trim() || !currentConversation) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setStatus("sending");

    // 사용자 메시지 추가
    addMessage(currentConversation.id, {
      role: "user",
      content: messageText,
    });

    setStatus("streaming");

    // 스트림 시작
    await streamChat(messageText, currentConversation.id, {
      onMessage: (message: ChatMessage) => {
        // 새 메시지 추가하고 실제 생성된 messageId 반환
        const messageId = addMessage(currentConversation.id, {
          role: message.role,
          content: message.content,
          isStreaming: message.isStreaming,
          metadata: message.metadata,
        });
        return messageId;
      },
      onMessageUpdate: (
        messageId: string,
        chunkContent: string,
        isStreaming?: boolean
      ) => {
        // 기존 메시지의 content에 chunk 누적 또는 isStreaming 업데이트
        if (!currentConversation) return;

        console.log("[ChatInterface] onMessageUpdate called:", {
          messageId,
          chunkContent,
          isStreaming,
        });

        // chunkContent가 있으면 누적
        if (chunkContent) {
          console.log("[ChatInterface] Appending content:", chunkContent);
          appendMessageContent(currentConversation.id, messageId, chunkContent);
        }

        // isStreaming 상태 업데이트
        if (isStreaming !== undefined) {
          console.log("[ChatInterface] Updating isStreaming:", isStreaming);
          updateMessage(currentConversation.id, messageId, { isStreaming });
        }
      },
      onError: (error) => {
        console.error("Stream error:", error);
        setStatus("error");
      },
      onComplete: () => {
        // 모든 스트리밍 메시지의 isStreaming을 false로 변경
        const conversation = getCurrentConversation();
        if (conversation) {
          conversation.messages.forEach((msg) => {
            if (msg.isStreaming) {
              updateMessage(currentConversation.id, msg.id, {
                isStreaming: false,
              });
            }
          });
        }
        setStatus("completed");
      },
    });
  };

  const isDisabled = status === "sending" || status === "streaming";

  if (!currentConversation) {
    return (
      <MessagesArea>
        <div
          style={{
            textAlign: "center",
            color: "#666",
            marginTop: "50px",
            fontSize: "18px",
          }}
        >
          대화를 선택하거나 새 대화를 시작하세요
        </div>
      </MessagesArea>
    );
  }

  if (isLoadingHistory) {
    return (
      <MessagesArea>
        <div
          style={{
            textAlign: "center",
            color: "#666",
            marginTop: "50px",
            fontSize: "18px",
          }}
        >
          채팅 이력을 불러오는 중...
        </div>
      </MessagesArea>
    );
  }

  if (isHistoryError) {
    // 에러가 발생해도 계속 진행 (세션이 없을 수도 있음)
    console.error("Failed to load session history");
  }

  return (
    <>
      <MessagesArea>
        {messages.map((message) => (
          <MessageDisplay key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </MessagesArea>
      <div style={{ padding: "20px" }}>
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          disabled={isDisabled}
          placeholder={
            isDisabled ? "AI가 응답 중입니다..." : "메시지를 입력하세요..."
          }
        />
      </div>
    </>
  );
};
