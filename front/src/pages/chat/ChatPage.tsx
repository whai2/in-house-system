import type { ChatConversation } from "@/entities/chat";
import { useAllSessions } from "@/entities/chat";
import styled from "@emotion/styled";
import { useMemo, useState } from "react";
import { ChatInterface } from "../../features/chat";
import { theme } from "../../shared/lib/theme";
import { useChatStore } from "../../shared/store/chatStore";
import {
  ChatContainer,
  ChatContent,
  ChatHeader,
  ChatMain,
  ConversationList,
  Sidebar,
} from "../../shared/ui";

const ToggleButton = styled.button`
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: ${theme.borderRadius.md};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.background.light};
  }

  svg {
    width: 24px;
    height: 24px;
    fill: ${theme.colors.text.primary};
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: ${theme.colors.text.primary};
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
`;

export const ChatPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    conversations: localConversations,
    currentConversationId,
    createConversation,
    setCurrentConversation,
    getCurrentConversation,
  } = useChatStore();

  // 서버에서 세션 목록 조회
  const { data: sessionsResponse, isLoading: isLoadingSessions } =
    useAllSessions();

  // 세션 데이터를 ChatConversation 형태로 변환
  const serverConversations = useMemo<ChatConversation[]>(() => {
    if (!sessionsResponse?.sessions) return [];
    return sessionsResponse.sessions.map((session) => ({
      id: session.session_id,
      title: undefined, // 세션에는 title이 없으므로 나중에 채팅 이력에서 가져올 수 있음
      messages: [], // 채팅 이력은 별도로 로드
      createdAt: new Date(session.created_at).getTime(),
      updatedAt: new Date(session.updated_at).getTime(),
    }));
  }, [sessionsResponse]);

  // 서버 세션과 로컬 대화를 병합 (로컬이 우선)
  const conversations = useMemo(() => {
    const localIds = new Set(localConversations.map((c) => c.id));
    const serverOnly = serverConversations.filter((c) => !localIds.has(c.id));
    return [...localConversations, ...serverOnly].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }, [localConversations, serverConversations]);

  const currentConversation = getCurrentConversation();

  const handleNewConversation = () => {
    const newId = createConversation();
    setCurrentConversation(newId);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversation(id);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <ChatContainer>
      <Sidebar isOpen={sidebarOpen}>
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          isLoading={isLoadingSessions}
        />
      </Sidebar>

      <ChatMain>
        <ChatHeader>
          <HeaderControls>
            <ToggleButton onClick={toggleSidebar} title="사이드바 토글">
              <svg viewBox="0 0 24 24">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
              </svg>
            </ToggleButton>
            <HeaderTitle>{currentConversation?.title || "새 대화"}</HeaderTitle>
          </HeaderControls>

          <HeaderControls>
            <ToggleButton onClick={handleNewConversation} title="새 대화">
              <svg viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </ToggleButton>
          </HeaderControls>
        </ChatHeader>

        <ChatContent>
          <ChatInterface />
        </ChatContent>
      </ChatMain>
    </ChatContainer>
  );
};
