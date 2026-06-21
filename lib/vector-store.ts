import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddedChunk, RetrievedChunk, VectorStoreFile } from "./types";

export const VECTORS_PATH = join(process.cwd(), "data", "vectors.json");

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function saveVectorStore(
  chunks: EmbeddedChunk[],
  provider: string,
  model: string,
  dim: number
): void {
  const file: VectorStoreFile = {
    provider,
    model,
    dim,
    builtAt: new Date().toISOString(),
    chunks,
  };
  writeFileSync(VECTORS_PATH, JSON.stringify(file));
}

let cache: VectorStoreFile | null = null;

export function loadVectorStore(): VectorStoreFile {
  if (cache) return cache;
  if (!existsSync(VECTORS_PATH)) {
    throw new Error(
      `Vector index not found at ${VECTORS_PATH}. Run \`npm run ingest\` first.`
    );
  }
  cache = JSON.parse(readFileSync(VECTORS_PATH, "utf8")) as VectorStoreFile;
  return cache;
}

/** Brute-force top-k cosine search. Fine for a corpus of this size. */
export function search(
  store: VectorStoreFile,
  queryEmbedding: number[],
  topK: number
): RetrievedChunk[] {
  const scored = store.chunks.map((c) => ({
    id: c.id,
    text: c.text,
    chunkIndex: c.chunkIndex,
    meta: c.meta,
    score: cosineSimilarity(queryEmbedding, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
