import { useEffect, useState } from "react";
import { checkHealth, listModels, setChatModel } from "../lib/api";
import type { HealthResponseBody } from "../../shared/types";

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  const [health, setHealth] = useState<HealthResponseBody | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch(() => setHealth(null));

    listModels()
      .then(({ models, current }) => {
        setModels(models);
        setSelectedModel(current);
      })
      .catch(() => setError("Couldn't reach Ollama to list models."));
  }, []);

  const handleModelChange = async (model: string) => {
    const previous = selectedModel;
    setSelectedModel(model);
    setIsSaving(true);
    setError(null);

    try {
      await setChatModel(model);
    } catch {
      setSelectedModel(previous);
      setError("Failed to update the chat model.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-offwhite shadow-xl">
        <div className="flex items-center justify-between rounded-t-lg bg-navy px-6 py-4">
          <h2 className="text-lg font-semibold text-white">About Logbook</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-white/80 hover:text-white"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-slate-600">Ask Buc about Blair's policies.</p>

          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Ollama</dt>
              <dd className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    health?.ollamaReachable ? "bg-teal" : "bg-red-500"
                  }`}
                />
                {health?.ollamaReachable ? "Reachable" : "Unreachable"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Embedding model</dt>
              <dd>{health?.embedModel ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Indexed chunks</dt>
              <dd>{health?.indexedChunks ?? "—"}</dd>
            </div>
          </dl>

          <div>
            <label htmlFor="chat-model" className="mb-1 block text-sm text-slate-500">
              Chat model
            </label>
            <select
              id="chat-model"
              value={selectedModel}
              disabled={isSaving || models.length === 0}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal focus:outline-none"
            >
              {selectedModel && !models.includes(selectedModel) && (
                <option value={selectedModel}>{selectedModel}</option>
              )}
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            {isSaving && <p className="mt-1 text-xs text-slate-500">Saving…</p>}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <p className="mt-1 text-xs text-slate-500">
              This changes the model for everyone using Logbook.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
