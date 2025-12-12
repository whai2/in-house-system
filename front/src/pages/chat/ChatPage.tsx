import { useState } from 'react';
import {
  ChatContainer,
  Sidebar,
  ChatMain,
  ChatHeader,
  ChatContent,
  ConversationList
} from '../../shared/ui';
import { ChatInterface } from '../../features/chat';
import { useChatStore } from '../../shared/store/chatStore';
import styled from '@emotion/styled';
import { theme } from '../../shared/lib/theme';

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
    conversations,
    currentConversationId,
    createConversation,
    setCurrentConversation,
    getCurrentConversation,
  } = useChatStore();

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
            <HeaderTitle>
              {currentConversation?.title || '새 대화'}
            </HeaderTitle>
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