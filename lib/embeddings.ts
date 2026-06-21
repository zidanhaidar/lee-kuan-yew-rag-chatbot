// Embedding abstraction with two interchangeable backends:
//
//   "local"   — a deterministic feature-hashing embedder (the "hashing trick").
//               Zero dependencies, zero API keys, fully offline. Good enough to
//               demonstrate retrieval over a small curated corpus.
//   "gateway" — real dense embeddings via the Vercel AI Gateway (recommended
//               for production-quality semantic retrieval).
//
// The vector index records which backend built it so queries always embed with
// the SAME backend (mixing embedding spaces would break cosine similarity).

const LOCAL_DIM = 1024;
export const LOCAL_MODEL_ID = "hashing-fnv-1024";

export interface Embedder {
  provider: "local" | "gateway";
  model: string;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Local hashing embedder
// ---------------------------------------------------------------------------

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function features(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  for (const w of words) {
    out.push(w); // unigram
    const padded = `#${w}#`;
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.push("g:" + padded.slice(i, i + 3)); // char trigram (robust to morphology)
    }
  }
  return out;
}

function localEmbedOne(text: string): number[] {
  const v = new Array<number>(LOCAL_DIM).fill(0);
  const counts = new Map<string, number>();
  for (const f of features(text)) counts.set(f, (counts.get(f) ?? 0) + 1);

  for (const [feat, count] of counts) {
    const h = fnv1a(feat);
    const idx = h % LOCAL_DIM;
    const sign = fnv1a(feat + "#s") % 2 === 0 ? 1 : -1;
    const weight = 1 + Math.log(count); // sublinear term frequency
    v[idx] += sign * weight;
  }

  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

const localEmbedder: Embedder = {
  provider: "local",
  model: LOCAL_MODEL_ID,
  dim: LOCAL_DIM,
  async embed(texts) {
    return texts.map(localEmbedOne);
  },
};

// ---------------------------------------------------------------------------
// Gateway embedder (AI SDK -> Vercel AI Gateway)
// ---------------------------------------------------------------------------

function gatewayEmbedder(model: string): Embedder {
  return {
    provider: "gateway",
    model,
    dim: 0, // discovered from the first response
    async embed(texts) {
      const { embedMany } = await import("ai");
      const { embeddings } = await embedMany({
        model,
        values: texts,
      });
      this.dim = embeddings[0]?.length ?? 0;
      return embeddings;
    },
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Build an embedder. When `provider` is omitted it is taken from
 * EMBEDDING_PROVIDER (default "local"). The gateway backend requires
 * AI_GATEWAY_API_KEY; if it is missing we transparently fall back to local so
 * the pipeline never hard-fails.
 */
export function getEmbedder(provider?: string): Embedder {
  const want = (provider ?? process.env.EMBEDDING_PROVIDER ?? "local").toLowerCase();

  if (want === "gateway") {
    if (!process.env.AI_GATEWAY_API_KEY) {
      console.warn(
        "[embeddings] EMBEDDING_PROVIDER=gateway but AI_GATEWAY_API_KEY is not set — falling back to local hashing embedder."
      );
      return localEmbedder;
    }
    return gatewayEmbedder(process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small");
  }

  return localEmbedder;
}
