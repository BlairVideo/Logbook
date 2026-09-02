import clsx from "clsx";
import type { SourceRef } from "../../shared/types";

interface Props {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
}

export default function MessageBubble({ role, content, sources }: Props) {
  const isUser = role === "user";

  return (
    <div className={clsx("flex flex-col", isUser ? "items-end self-end" : "items-start self-start")}>
      <div
        className={clsx(
          "max-w-xl whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser
            ? "border border-slate-200 bg-white text-slate-800"
            : "border border-teal/30 bg-white text-slate-800",
        )}
      >
        {content}
      </div>
      {!isUser && sources && sources.length > 0 && (
        <p className="mt-1 px-1 text-xs text-slate-400">
          Sources:{" "}
          {sources
            .map((s) => (s.page ? `${s.title} (p. ${s.page})` : s.title))
            .join(", ")}
        </p>
      )}
    </div>
  );
}
