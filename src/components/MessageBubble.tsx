import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SourceRef } from "../../shared/types";

interface Props {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
}

// Assistant answers come back as markdown (bold section headers, bulleted
// lists, a "---" rule before the closing HR note); user messages are rendered
// as plain text since there's no reason to interpret markdown someone typed.
const MARKDOWN_COMPONENTS = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  hr: () => <hr className="my-2 border-slate-200" />,
  a: ({ ...props }) => (
    <a className="text-teal underline hover:no-underline" target="_blank" rel="noreferrer" {...props} />
  ),
};

export default function MessageBubble({ role, content, sources }: Props) {
  const isUser = role === "user";

  return (
    <div className={clsx("flex flex-col", isUser ? "items-end self-end" : "items-start self-start")}>
      <div
        className={clsx(
          "max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser
            ? "whitespace-pre-wrap border border-slate-200 bg-white text-slate-800"
            : "border border-teal/30 bg-white text-slate-800",
        )}
      >
        {isUser ? (
          content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {content}
          </ReactMarkdown>
        )}
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
