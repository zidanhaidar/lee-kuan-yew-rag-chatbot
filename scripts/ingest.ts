import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { loadCorpusChunks } from "../lib/corpus";
import { getEmbedder } from "../lib/embeddings";
import { saveVectorStore } from "../lib/vector-store";
import type { EmbeddedChunk } from "../lib/types";

async function main() {
  console.log("Loading and chunking corpus…");
  const chunks = loadCorpusChunks();
  console.log(`  ${chunks.length} chunks from ${new Set(chunks.map((c) => c.meta.id)).size} source documents.`);

  const embedder = getEmbedder();
  console.log(`Embedding with provider="${embedder.provider}" model="${embedder.model}"…`);

  const texts = chunks.map((c) => c.text);
  const embeddings: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await embedder.embed(batch);
    embeddings.push(...vecs);
    process.stdout.write(`  embedded ${Math.min(i + batchSize, texts.length)}/${texts.length}\r`);
  }
  console.log("");

  const embedded: EmbeddedChunk[] = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
  const dim = embeddings[0]?.length ?? embedder.dim;

  saveVectorStore(embedded, embedder.provider, embedder.model, dim);
  console.log(`Saved vector index (${embedded.length} chunks, dim=${dim}) -> data/vectors.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
