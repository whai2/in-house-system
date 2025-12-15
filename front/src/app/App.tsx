import { ChatPage } from "@/pages/chat";
import { GlobalStyleProvider } from "./providers/globalStyleProvider";
import { QueryProvider } from "./providers/queryProvider";

function App() {
  return (
    <QueryProvider>
      <GlobalStyleProvider>
        <ChatPage />
      </GlobalStyleProvider>
    </QueryProvider>
  );
}

export default App;
