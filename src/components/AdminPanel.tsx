import { useEffect, useRef, useState } from "react";
import {
  fetchAuditLog,
  listModels,
  setChatModel,
  streamIngest,
  verifyAdminKey,
} from "../lib/api";
import type { AuditLogItem } from "../../shared/types";

const STORAGE_KEY = "logbook-admin-key";

function readStoredKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-browsing or storage-blocked contexts: admin unlock just won't
    // persist across a refresh, which is a fine degradation here.
  }
}

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredKey();
    if (!stored) return;
    verifyAdminKey(stored).then((ok) => {
      if (ok) setAdminKey(stored);
      else storeKey(null);
    });
  }, []);

  const handleUnlock = async () => {
    setVerifying(true);
    setUnlockError(null);
    try {
      const ok = await verifyAdminKey(passphraseInput);
      if (ok) {
        storeKey(passphraseInput);
        setAdminKey(passphraseInput);
        setPassphraseInput("");
      } else {
        setUnlockError("Incorrect passphrase.");
      }
    } catch {
      setUnlockError("Couldn't reach the server to verify.");
    } finally {
      setVerifying(false);
    }
  };

  const handleLock = () => {
    storeKey(null);
    setAdminKey(null);
  };

  if (!adminKey) {
    return (
      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2 text-sm text-slate-500">
          Admin passphrase unlocks model switching, the audit log, and re-ingestion.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={passphraseInput}
            onChange={(e) => setPassphraseInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Admin passphrase"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal focus:outline-none"
          />
          <button
            onClick={handleUnlock}
            disabled={verifying || !passphraseInput}
            className="rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {verifying ? "Checking…" : "Unlock"}
          </button>
        </div>
        {unlockError && <p className="mt-1 text-xs text-red-600">{unlockError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Admin</h3>
        <button onClick={handleLock} className="text-xs text-slate-500 hover:text-slate-700">
          Lock
        </button>
      </div>
      <ModelSection adminKey={adminKey} />
      <IngestSection adminKey={adminKey} />
      <AuditLogSection adminKey={adminKey} />
    </div>
  );
}

function ModelSection({ adminKey }: { adminKey: string }) {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      await setChatModel(model, adminKey);
    } catch {
      setSelectedModel(previous);
      setError("Failed to update the chat model.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
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
      <p className="mt-1 text-xs text-slate-500">This changes the model for everyone using Logbook.</p>
    </div>
  );
}

function IngestSection({ adminKey }: { adminKey: string }) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<"success" | "failure" | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setLines([]);

    try {
      const success = await streamIngest(adminKey, (line) => {
        setLines((prev) => [...prev, line]);
        requestAnimationFrame(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        });
      });
      setResult(success ? "success" : "failure");
    } catch (err) {
      setLines((prev) => [...prev, err instanceof Error ? err.message : "Ingestion failed."]);
      setResult("failure");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-slate-500">Re-run ingestion</span>
        <button
          onClick={handleRun}
          disabled={running}
          className="rounded border border-navy px-2.5 py-1 text-xs font-medium text-navy hover:bg-navy hover:text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>
      {lines.length > 0 && (
        <pre
          ref={logRef}
          className="max-h-40 overflow-y-auto rounded bg-slate-900 p-2 text-[11px] leading-snug text-slate-100"
        >
          {lines.join("\n")}
        </pre>
      )}
      {result === "success" && <p className="mt-1 text-xs text-teal">Ingestion completed successfully.</p>}
      {result === "failure" && (
        <p className="mt-1 text-xs text-red-600">Ingestion finished with errors — see log above.</p>
      )}
    </div>
  );
}

function AuditLogSection({ adminKey }: { adminKey: string }) {
  const [entries, setEntries] = useState<AuditLogItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchAuditLog(adminKey));
    } catch {
      setError("Failed to load the audit log.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-slate-500">Audit log</span>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="rounded border border-navy px-2.5 py-1 text-xs font-medium text-navy hover:bg-navy hover:text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : entries ? "Refresh" : "Load"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {entries && (
        <ul className="max-h-56 space-y-2 overflow-y-auto rounded border border-slate-200 bg-white p-2 text-xs">
          {entries.length === 0 && <li className="text-slate-500">No entries yet.</li>}
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
              <div className="mb-0.5 flex items-center justify-between text-slate-400">
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                <span className="uppercase">{entry.type.replace("_", " ")}</span>
              </div>
              {entry.type === "chat" ? (
                <>
                  <p className="font-medium text-slate-700">{entry.question}</p>
                  <p className="mt-0.5 line-clamp-2 text-slate-500">{entry.answer}</p>
                  <p className="mt-0.5 text-slate-400">
                    {entry.model} · {entry.sourceTitles?.join(", ") || "no sources"}
                  </p>
                </>
              ) : (
                <p className="text-slate-600">
                  {entry.previousModel} → {entry.newModel}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
