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

export interface HealthResponseBody {
  ok: boolean;
  chatModel: string;
  embedModel: string;
  indexedChunks: number;
  ollamaReachable: boolean;
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
