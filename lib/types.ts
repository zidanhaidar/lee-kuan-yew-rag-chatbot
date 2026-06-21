// Shared types for the RAG pipeline.

export interface SourceMeta {
  id: string;
  title: string;
  work: string;
  year: number | string;
  type: string;
  source: string; // full citation string
  url: string;
  theme: string;
}

export interface Chunk {
  /** Unique id: `${sourceId}#${index}` */
  id: string;
  text: string;
  /** 0-based position of this chunk within its source document. */
  chunkIndex: number;
  meta: SourceMeta;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface VectorStoreFile {
  /** Embedding provider used to build the index ("local" | "gateway"). */
  provider: string;
  /** Model id used (the literal model string, or "hashing-fnv-1024" for local). */
  model: string;
  dim: number;
  builtAt: string;
  chunks: EmbeddedChunk[];
}

export interface RetrievedChunk extends Chunk {
  score: number;
}
