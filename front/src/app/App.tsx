import { GlobalStyleProvider } from './providers/globalStyleProvider';
import { ChatPage } from '@/pages/chat';

function App() {
  return (
    <GlobalStyleProvider>
      <ChatPage />
    </GlobalStyleProvider>
  );
}

export default App;
