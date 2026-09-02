import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import type { SourceRef } from "../../shared/types";

export interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
}

interface Props {
  messages: DisplayMessage[];
  isLoading: boolean;
}

export default function ChatWindow({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
      {messages.length === 0 && !isLoading && (
        <div className="m-auto max-w-md text-center text-sm text-slate-400">
          Ask Buc anything about Blair's employee handbook, benefits guide, or student
          handbook — for example, "How much PTO do I accrue?" or "What's the dress code?"
        </div>
      )}
      {messages.map((m, i) => (
        <MessageBubble key={i} role={m.role} content={m.content} sources={m.sources} />
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
