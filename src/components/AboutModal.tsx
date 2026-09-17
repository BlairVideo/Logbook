import { useEffect, useState } from "react";
import { checkHealth } from "../lib/api";
import AdminPanel from "./AdminPanel";
import type { HealthResponseBody } from "../../shared/types";

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  const [health, setHealth] = useState<HealthResponseBody | null>(null);

  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

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

          <AdminPanel />
        </div>
      </div>
    </div>
  );
}
