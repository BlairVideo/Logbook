import { useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChatWindow, { type DisplayMessage } from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import { streamChatMessage } from "./lib/api";
import type { ChatMessage, SourceRef } from "../shared/types";

export default function App() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (text: string) => {
    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    let sources: SourceRef[] | undefined;
    let started = false;

    try {
      await streamChatMessage(text, history, {
        onSources: (s) => {
          sources = s;
        },
        onDelta: (chunk) => {
          if (!started) {
            started = true;
            setIsLoading(false);
            setMessages((prev) => [...prev, { role: "assistant", content: chunk, sources }]);
            return;
          }
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + chunk };
            return next;
          });
        },
      });
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
