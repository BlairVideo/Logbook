export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceRef {
  title: string;
  page?: number;
}

export interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponseBody {
  answer: string;
  sources: SourceRef[];
}

// /api/chat streams newline-delimited JSON events of this shape rather than a
// single ChatResponseBody, so the UI can render tokens as they're generated.
export type ChatStreamEvent =
  | { type: "sources"; sources: SourceRef[] }
  | { type: "delta"; content: string }
  | { type: "error"; error: string }
  | { type: "done" };

export interface HealthResponseBody {
  ok: boolean;
  chatModel: string;
  embedModel: string;
  indexedChunks: number;
  ollamaReachable: boolean;
}

export interface ModelsResponseBody {
  models: string[];
  current: string;
}

export interface ChunkSource {
  file: string;
  title: string;
  page?: number;
  section?: string;
}

export interface Chunk {
  id: string;
  text: string;
  embedding: number[];
  source: ChunkSource;
  charCount: number;
}

export interface ChunkIndex {
  embedModel: string;
  dims: number;
  chatModel: string;
  createdAt: string;
  chunkCount: number;
  chunks: Chunk[];
}
