import { useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChatWindow, { type DisplayMessage } from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import { sendChatMessage } from "./lib/api";
import type { ChatMessage } from "../shared/types";

export default function App() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (text: string) => {
    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const { answer, sources } = await sendChatMessage(text, history);
      setMessages((prev) => [...prev, { role: "assistant", content: answer, sources }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't reach Buc's brain just now. Make sure Ollama is running locally and try again, or contact HR directly for urgent matters.",
        },
      ]);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-offwhite">
      <Header />
      <ChatWindow messages={messages} isLoading={isLoading} />
      <ChatInput onSend={handleSend} disabled={isLoading} />
      <Footer />
    </div>
  );
}
