import type { ChatMessage } from "@/entities/chat";
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

        console.log('[ChatInterface] onMessageUpdate called:', { messageId, chunkContent, isStreaming });

        // chunkContent가 있으면 누적
        if (chunkContent) {
          console.log('[ChatInterface] Appending content:', chunkContent);
          appendMessageContent(currentConversation.id, messageId, chunkContent);
        }

        // isStreaming 상태 업데이트
        if (isStreaming !== undefined) {
          console.log('[ChatInterface] Updating isStreaming:', isStreaming);
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
