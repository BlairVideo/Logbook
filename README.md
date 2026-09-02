# Logbook

Logbook is a local chatbot for Blair Academy. Its assistant, **Buc**, answers
employee and student policy questions grounded only in Blair's own policy
documents (the employee handbook, benefits guide, and student handbook),
using a local Ollama model — no cloud LLM, no data leaves the machine.

## Prerequisites

- [Ollama](https://ollama.com) installed and running locally.
- The chat and embedding models pulled:

  ```bash
  ollama pull gemma3:12b
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

## Configuration

Copy `.env.example` to `.env` to override defaults (port, Ollama host,
model names, retrieval `TOP_K`).
