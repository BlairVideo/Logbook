export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 self-start rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal" />
      </span>
      Buc is thinking…
    </div>
  );
}
