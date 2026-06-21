import { getEmbedder } from "./embeddings";
import { loadVectorStore, search } from "./vector-store";
import type { RetrievedChunk } from "./types";

const DEFAULT_TOP_K = Number(process.env.RETRIEVAL_TOP_K ?? 6);

/**
 * Embed the query with the SAME backend that built the index, then return the
 * top-k most similar chunks. A minimum-score floor filters out chunks that are
 * only weakly related, which is what lets the model say "I don't have a sourced
 * basis for that" instead of forcing a grounding that isn't there.
 */
export async function retrieve(
  query: string,
  topK = DEFAULT_TOP_K,
  minScore = 0.05
): Promise<RetrievedChunk[]> {
  const store = loadVectorStore();
  const embedder = getEmbedder(store.provider);

  if (embedder.provider !== store.provider) {
    console.warn(
      `[retrieval] Index built with "${store.provider}" but active embedder is "${embedder.provider}". Results may be poor; re-run ingest.`
    );
  }

  const [queryEmbedding] = await embedder.embed([query]);
  const results = search(store, queryEmbedding, topK);
  return results.filter((r) => r.score >= minScore);
}

/** Format retrieved chunks into a numbered context block for the LLM prompt. */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "(No sufficiently relevant passages were found in the source corpus for this question.)";
  }
  return chunks
    .map((c, i) => {
      const { meta } = c;
      const cite = `${meta.work}${meta.year ? `, ${meta.year}` : ""}`;
      return `[#${i + 1}] (${cite} — ${meta.title})\n${c.text}`;
    })
    .join("\n\n");
}
