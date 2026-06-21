# What Would Lee Kuan Yew Do? — a grounded RAG chatbot

An educational, **retrieval-augmented** chatbot that answers questions across life, geopolitics,
history, governance, and economics in the documented voice and reasoning style of **Lee Kuan Yew
(LKY)**, Singapore's founding Prime Minister.

The core principle is **ground, don't fabricate**: the persona is built on retrieval from real
source material. When the corpus doesn't cover a question, the model extends his documented
reasoning *and clearly labels it as inference* rather than inventing quotes or positions. A visible
disclaimer makes clear this is an AI emulation for educational/exploratory use — not the real
person, and not an authoritative source.

**Live demo:** https://lee-kuan-yew.vercel.app
📄 **Full write-up:** see [TECHNICAL_NOTES.md](./TECHNICAL_NOTES.md) — data sources, RAG pipeline,
persona prompt, model choices, evaluation method/results, and technical architecture.

---

## Quick start

```bash
npm install
npm run ingest          # build the vector index (works offline, no API key needed)
npm run dev             # http://localhost:3000
```

Out of the box the **retrieval pipeline runs with no API keys** (a deterministic local embedder).
To enable the spoken LKY reply (the LLM step), add one key:

```bash
cp .env.example .env.local
# set AI_GATEWAY_API_KEY=...   (https://vercel.com/ai-gateway)
# optional: EMBEDDING_PROVIDER=gateway   for higher-quality semantic retrieval
npm run ingest          # re-run if you switched the embedding provider
npm run dev
```

Useful scripts:

| command | what it does |
|---|---|
| `npm run ingest` | chunk + embed the corpus → `data/vectors.json` |
| `npm run retrieve -- "your question"` | inspect retrieval only (no LLM) |
| `npm run eval` | run the evaluation set (retrieval metrics always; + LLM-as-judge if a key is set) |
| `npm run dev` / `build` / `start` | the Next.js chat app |

---

## Architecture

```
                         ┌────────────────────────────────────────────┐
   data/corpus/*.md  ──► │ ingest.ts                                    │
   (cited sources)       │  • gray-matter frontmatter → SourceMeta      │
                         │  • paragraph-aware chunking (size+overlap)   │
                         │  • embed (local hashing  OR  AI Gateway)     │
                         └───────────────┬──────────────────────────────┘
                                         ▼
                                data/vectors.json   (file-based vector store)
                                         ▲
   browser  ──POST /api/chat──►  ┌───────┴────────────────────────────────┐
   (Chat.tsx, multi-turn)        │ route.ts                                │
                                 │  1. retrieve top-k (cosine) ────────────┘
                                 │  2. build persona system prompt + grounded context
                                 │  3. streamText() → Claude via AI Gateway
                                 │  4. stream reply  +  sources in x-lky-sources header
                                 └──────────────────────────────────────────┘
```

- **Frontend** — Next.js (App Router) + React. A custom streaming `fetch` (not `useChat`) gives
  full control over surfacing citations: sources travel in a base64 `x-lky-sources` response
  header so they render immediately, even when generation is unconfigured.
- **Backend** — a single Route Handler does retrieval → prompt assembly → streamed generation.
- **No external infra required** for the demo; see [Swapping the vector store](#swapping-the-vector-store) to move to pgvector/Pinecone/etc.

---

## Technical approach & notes

### Data sources

The knowledge base in `data/corpus/` is a **curated set of genuine, widely-published LKY material**,
each file carrying a citation in its frontmatter (`work`, `year`, `type`, `source`, `url`). Themes
covered: nationhood & separation (1965), leadership & power, survival/vulnerability, meritocracy,
clean government, democracy & "Asian values", the rise of China, the United States, India,
bilingualism, home ownership, rule of law, foreign policy of small states, population policy,
economic strategy, legacy, welfare & self-reliance, defence & National Service, the press,
Western liberalism & human rights, mortality & marriage, social-discipline laws, Deng Xiaoping &
China's reform, the Garden City & environment, globalisation, leadership succession, and race &
religious harmony.

Sources drawn upon:

1. **Speeches** — e.g. the 1965 separation press conference, National Day Rally addresses
   (National Archives of Singapore speech repository, `nas.gov.sg/archivesonline`).
2. **Memoirs** — *The Singapore Story* (1998) and *From Third World to First* (2000).
3. **Books & interviews** — *One Man's View of the World* (2013), *Hard Truths to Keep Singapore
   Going* (2011), *My Lifelong Challenge: Singapore's Bilingual Journey* (2012), and Fareed
   Zakaria's *Culture Is Destiny* interview (*Foreign Affairs*, 1994).

> **Copyright & honesty note.** The corpus uses short, attributed excerpts and widely-quoted
> passages for an educational, transformative purpose. Some passages are lightly condensed/
> paraphrased and are presented with their source. **Verify exact wording against the primary
> archives before quoting authoritatively.** To extend the corpus, drop additional `.md` files
> (legitimately licensed or public-domain-adjacent text) into `data/corpus/` with the same
> frontmatter and re-run `npm run ingest`. This is the single intended way to grow the knowledge
> base.

### Chunking

Paragraph-aware chunking with character overlap (`lib/chunk.ts`): split on blank lines, greedily
pack paragraphs to ~`CHUNK_SIZE` (default **900** chars), carry a ~`CHUNK_OVERLAP` (default **150**
chars) tail into the next chunk so passages spanning a boundary stay retrievable; over-long
paragraphs are hard-split. Each chunk inherits its source's citation. Current corpus → **53 chunks
from 27 documents**.

### Embeddings (two interchangeable backends)

`lib/embeddings.ts` exposes a single `Embedder` interface with two backends, selected by
`EMBEDDING_PROVIDER`:

- **`local`** (default) — a deterministic **feature-hashing** embedder (the "hashing trick":
  word unigrams + character trigrams → signed FNV-1a hashing into 1024 dims, sublinear TF, L2
  normalized). Zero keys, fully offline, good enough to demonstrate retrieval over a small corpus.
- **`gateway`** — real dense embeddings via the **Vercel AI Gateway** (default
  `openai/text-embedding-3-small`). Recommended for production-quality semantic retrieval.

The index records which backend built it (`provider`/`model`/`dim`), and queries always embed with
the **same** backend so the embedding spaces match.

### Vector store & retrieval

A simple **file-based vector store** (`data/vectors.json`) with brute-force top-k **cosine**
similarity (`lib/vector-store.ts`) — appropriate for a corpus of this size and trivially portable.
Retrieval (`lib/retrieval.ts`) returns the top-`RETRIEVAL_TOP_K` (default **6**) chunks above a
small score floor; the floor is what lets the model honestly say "I have no sourced basis for that"
on out-of-corpus questions instead of forcing a weak grounding.

### Model & persona

- **Generation** — Claude via the AI Gateway (`CHAT_MODEL`, default `anthropic/claude-sonnet-4-6`),
  streamed with the AI SDK (`streamText`).
- **Persona prompt** (`lib/persona.ts`) does three jobs: (a) sets the LKY voice (pragmatic, direct,
  unsentimental, long-term, meritocratic, results-oriented); (b) forces grounding in the retrieved
  passages with inline `[#n]` citations; (c) requires the model to **distinguish sourced views from
  reasoned inference** and to **refuse to fabricate** quotes, stats, or positions. The persona is
  meant to *emerge from the retrieved content*, not from caricature.

### Chat experience

Simple text chat, multi-turn with context retention (full history posted each turn; only the
current turn is grounded with retrieved context so prior turns stay intact). Clear AI-emulation
disclaimer in the header. A **"Show retrieved sources"** toggle reveals, per answer, each source's
title, work/year, similarity score, snippet, and full citation.

### Evaluation

`eval/questions.json` is a small eval set of questions with known LKY positions and expected source
documents (14 in-corpus + 1 deliberately out-of-corpus "crypto" question that *should* trigger
flagged inference). `npm run eval`:

- **Retrieval metric (always):** recall@k — did at least one expected source appear in the top-k?
  **Current result with the offline local embedder: `retrieval_recall_at_k = 1.0`** across the
  14 sourced questions.
- **Generation metrics (when a key is set):** an **LLM-as-judge** rubric scores each answer 1–5 on
  *faithfulness*, *persona consistency*, *refusal-to-fabricate*, *relevance*, and *consistency with
  the known position*, plus a citation-presence check. Results are written to `eval/results.json`.

(For deeper retrieval/faithfulness metrics you can also point a tool like **Ragas** at the same
corpus + questions.)

---

## Deploy

### Vercel (recommended)

```bash
npm i -g vercel
vercel            # link/deploy
vercel env add AI_GATEWAY_API_KEY
```

`data/vectors.json` is committed and traced into the function bundle
(`outputFileTracingIncludes` in `next.config.mjs`), so retrieval works in production. Re-run
`npm run ingest` and redeploy after changing the corpus or embedding provider.

### Docker Compose

```bash
docker compose up --build       # http://localhost:3000
# pass a key:  AI_GATEWAY_API_KEY=... docker compose up --build
```

### Swapping the vector store

The store is isolated behind `lib/vector-store.ts` (`saveVectorStore` / `loadVectorStore` /
`search`). To move to **Supabase pgvector**, **Pinecone**, **Chroma**, or **Weaviate**, implement
the same three functions against that backend and keep the rest of the pipeline unchanged. A
commented `pgvector` service is included in `docker-compose.yml` as a starting point.

---

## Project layout

```
app/                 Next.js App Router (page, layout, globals.css)
  api/chat/route.ts  retrieval → persona prompt → streamed generation
components/Chat.tsx  multi-turn chat UI with sources toggle
lib/                 chunk, corpus, embeddings, vector-store, retrieval, persona, types
scripts/             ingest, retrieve, eval (CLI)
data/corpus/*.md     cited source documents (the knowledge base)
data/vectors.json    generated vector index
eval/                questions.json + generated results.json
```

## Limitations

- The default **local embedder is lexical**, not deeply semantic — fine for this curated corpus;
  switch to `EMBEDDING_PROVIDER=gateway` for paraphrase-robust retrieval.
- The corpus is intentionally compact. Coverage and faithfulness scale with the breadth of sourced
  material you add.
- This is an **emulation for education and exploration**, not the real Lee Kuan Yew and not an
  authoritative historical record.
