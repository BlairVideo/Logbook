# Logbook

Logbook is a local chatbot for Blair Academy. Its assistant, **Buc**, answers
employee and student policy questions grounded only in Blair's own policy
documents (the employee handbook, benefits guide, and student handbook),
using a local Ollama model — no cloud LLM, no data leaves the machine.

## Prerequisites

- [Ollama](https://ollama.com) installed and running locally.
- The chat and embedding models pulled:

  ```bash
  ollama pull command-r7b
  ollama pull nomic-embed-text
  ```

## Setup

```bash
npm install
npm run ingest   # parses books/ and builds server/data/index.json
npm run dev      # starts Vite (http://localhost:5173) + the API (http://localhost:5174)
```

Open http://localhost:5173 and ask Buc a question.

## Re-ingesting

Re-run `npm run ingest` any time the documents in `books/` change. The
ingest script prints per-document chunk counts and sample text so you can
confirm the extraction looks clean (this matters most for PDFs with
embedded/subsetted fonts, which can otherwise extract as garbled text).

## Project layout

- `src/` — React frontend (chat UI, header/footer, API client).
- `server/` — Express API that embeds the user's question, retrieves the
  most relevant policy excerpts, and calls Ollama to generate an answer.
- `scripts/` — the ingestion pipeline (DOCX/PDF extraction, chunking,
  embedding) that builds `server/data/index.json`.
- `books/` — source policy documents (not modified by the app).

## Testing

```bash
npm test          # run the full suite once
npm run test:watch
```

Covers the parts of the pipeline that are easy to break silently: chunking
boundaries and overlap (`scripts/chunk.test.ts`), garbled-text detection
(`scripts/garbledText.test.ts`), the DOCX list/table extraction fix
(`scripts/extractors/docx.test.ts`), PDF paragraph-break logic
(`scripts/extractors/pdf.test.ts`), retrieval math and relevance filtering
(`server/rag.test.ts`), audit-log encryption round-tripping and tamper
detection (`server/audit.test.ts`), the admin passphrase gate
(`server/adminAuth.test.ts`), chat-model persistence (`server/config.test.ts`),
and the HTTP routes end-to-end including RBAC enforcement
(`server/app.test.ts`, via supertest with Ollama/filesystem mocked out — no
running Ollama instance required).

## Configuration

Copy `.env.example` to `.env` to override defaults (port, Ollama host,
model names, retrieval `TOP_K`).

## Audit log

Every chat turn (question, answer, sources, model used) and every chat-model
change is recorded to `server/data/audit-log.jsonl` for HR compliance review.
The question/answer text is encrypted at rest (AES-256-GCM); everything else
(timestamp, model, source titles) is left in cleartext so entries can be
filtered without decrypting. The encryption key is auto-generated at
`server/data/audit-key.bin` on first run — back it up if you need the log to
remain readable after reinstalling, or set `AUDIT_LOG_KEY` (a 64-char hex
string) in `.env` to pin it explicitly. Neither the log nor the key is ever
committed to git.

Review the log locally with:

```bash
npm run audit:read
npm run audit:read -- --since 2026-09-01
```

## Admin access

Switching the chat model, viewing the audit log, and re-running ingestion
are gated behind a shared admin passphrase — everyone can still chat with
Buc freely. On first run, a passphrase is generated and printed to the
server's console (and saved to `server/data/admin-key.txt`); set `ADMIN_KEY`
in `.env` to pin it explicitly instead. Enter it from the "About" panel in
the app to unlock the admin section for that browser tab.
