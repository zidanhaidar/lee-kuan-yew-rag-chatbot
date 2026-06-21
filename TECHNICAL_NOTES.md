# Technical Approach & Implementation Notes

**Live demo:** https://lee-kuan-yew.vercel.app · **Repo:** https://github.com/zidanhaidar/lee-kuan-yew-rag-chatbot

## Overview

A retrieval-augmented chatbot that answers questions across life, governance, geopolitics, economics, and history in the documented voice and reasoning of Lee Kuan Yew (LKY). The guiding principle is **ground, don't fabricate**: every persona response is anchored in retrieved passages from genuine LKY source material, with inline citations. When the corpus does not cover a question, the model extends his documented reasoning *and explicitly labels it as inference* rather than inventing quotes or positions. A visible disclaimer states throughout that this is an AI emulation for educational use — not the real person and not an authoritative historical record.

## Data sources

The knowledge base lives in `data/corpus/` as **27 cited Markdown documents** (→ 53 chunks). Each file carries citation metadata in YAML frontmatter (`work`, `year`, `type`, `source`, `url`, `theme`), which flows through the pipeline and surfaces in the UI behind every answer. Material is drawn from four categories:

1. **Speeches** — e.g. the 1965 separation press conference, the 1971 International Press Institute (Helsinki) address, National Day Rally speeches (National Archives of Singapore speech repository).
2. **Memoirs** — *The Singapore Story* (1998) and *From Third World to First* (2000).
3. **Books & interviews** — *One Man's View of the World* (2013), *Hard Truths to Keep Singapore Going* (2011), *My Lifelong Challenge: Singapore's Bilingual Journey* (2012), and Fareed Zakaria's *Culture Is Destiny* interview (*Foreign Affairs*, 1994).
4. **Public transcripts / articles.**

Themes span nationhood and the 1965 separation, leadership and power, survival and vulnerability, meritocracy, clean government, democracy and "Asian values", the rise of China, the United States, India, bilingualism, home ownership, rule of law, foreign policy of small states, population policy, economic strategy, legacy, welfare and self-reliance, defence and National Service, the press, Western liberalism and human rights, social-discipline laws, Deng Xiaoping and China's reform, the Garden City, globalisation, leadership succession, and racial/religious harmony.

**Copyright posture:** the corpus uses short, attributed, widely-quoted excerpts (some lightly condensed) for an educational, transformative purpose, each presented with its source. Exact wording should be verified against the primary archives before authoritative quotation. The corpus is designed to grow by dropping additional legitimately-licensed / public-domain-adjacent `.md` files into `data/corpus/` with the same frontmatter and re-running ingestion.

## RAG implementation

**1. Ingest & chunk** (`lib/corpus.ts`, `lib/chunk.ts`, `scripts/ingest.ts`). `gray-matter` parses frontmatter into `SourceMeta`; the body is chunked with a **paragraph-aware, overlapping** strategy: split on blank lines, greedily pack paragraphs up to ~900 characters (`CHUNK_SIZE`), carry a ~150-character tail (`CHUNK_OVERLAP`) into the next chunk so passages spanning a boundary stay retrievable, and hard-split any over-long paragraph. Every chunk inherits its source's citation.

**2. Embed & store** (`lib/embeddings.ts`, `lib/vector-store.ts`). Embeddings sit behind a single `Embedder` interface with **two interchangeable backends**, selected by `EMBEDDING_PROVIDER`:
- **`local`** (default) — a deterministic **feature-hashing** embedder (word unigrams + character trigrams → signed FNV-1a hashing into 1024 dims, sublinear TF, L2-normalised). Zero keys, fully offline, good enough to demonstrate retrieval over a curated corpus.
- **`gateway`** — real dense embeddings via the Vercel AI Gateway (e.g. `openai/text-embedding-3-small`) for paraphrase-robust semantic retrieval.

The vector store is a **file-based index** (`data/vectors.json`) recording `provider` / `model` / `dim` so queries always embed in the same space the index was built in. Search is brute-force top-k **cosine similarity** — appropriate at this corpus size and trivially portable. The store is isolated behind three functions (`saveVectorStore` / `loadVectorStore` / `search`), so swapping to **Supabase pgvector, Pinecone, Chroma, or Weaviate** means reimplementing only those three (a commented pgvector service is included in `docker-compose.yml`).

**3. Retrieve & ground** (`lib/retrieval.ts`). Per query: embed with the index's backend, return the top-`RETRIEVAL_TOP_K` (default 6) chunks above a small **score floor**. The floor is deliberate — it lets the model honestly say "I have no sourced basis for that" on out-of-corpus questions instead of forcing a weak grounding. Retrieved chunks are formatted into a numbered context block (`[#1] (Work, Year — Title) …`) for citation.

**4. Generate** (`app/api/chat/route.ts`, `lib/persona.ts`, `lib/model.ts`). The route retrieves, assembles the persona system prompt + grounded context, and streams the reply. Crucially, **only the current turn is grounded** with retrieved context; prior turns are passed verbatim, preserving multi-turn memory without polluting history. Citations travel back to the client in a base64 `x-lky-sources` response header, so the **Sources** panel renders immediately — even when generation is unconfigured.

## Persona / system prompt design

The persona (`lib/persona.ts`) does three jobs: **(a)** sets the LKY voice — pragmatic, direct, unsentimental, long-term and strategic, with emphasis on order, discipline, stability, meritocracy, clean government, and results; **(b)** forces grounding in the retrieved passages with inline `[#n]` citations; **(c)** enforces the integrity rules: *distinguish sourced views from reasoned inference*, *never fabricate* quotes/stats/positions, and flag extrapolations for topics outside his era (e.g. post-2015 events). The persona is meant to *emerge from retrieved content*, not from caricature. Boundaries rule out individualised legal/medical/financial advice and demeaning content.

## Model choices

- **Generation:** the app auto-detects the configured backend. The live demo runs **Google AI Studio / Gemini (`gemini-2.5-flash`)**; alternatively a single **Vercel AI Gateway** key routes to Claude (`anthropic/claude-sonnet-4-6`) or others. `lib/model.ts` resolves the right model and the rest of the pipeline is provider-agnostic. Flash was chosen for fast, low-cost streaming that suits an interactive chat; the abstraction makes upgrading to a stronger model a one-line env change.
- **Embeddings:** local hashing by default (keyless demo); `text-embedding-3-small` via the gateway for production-grade semantics.
- **AI SDK:** Vercel AI SDK v5 (`streamText`) with `@ai-sdk/google` pinned to the v5-compatible v2 line.

## Evaluation methods

`eval/questions.json` is a curated set of **15 questions** (14 in-corpus with known LKY positions + expected source documents, plus 1 deliberately out-of-corpus "cryptocurrency" question that *should* trigger flagged inference rather than fabrication). `npm run eval` (`scripts/eval.ts`) computes:

- **Retrieval metric (always, keyless):** *recall@k* — did at least one expected source appear in the top-k? **Current result: `retrieval_recall_at_k = 1.0`** across all 14 sourced questions with the offline local embedder.
- **Generation metrics (when a key is set):** an **LLM-as-judge** rubric scores each answer 1–5 on *faithfulness* (grounding, no fabrication), *persona consistency*, *refusal-to-fabricate*, *answer relevance*, and *consistency with the known position*, plus a citation-presence check. Results are written to `eval/results.json`.

The eval set intentionally includes the inference case to verify the refusal-to-fabricate behaviour, not just happy-path recall. For deeper retrieval/faithfulness analysis, a tool like **Ragas** can be pointed at the same corpus + question set.

## Technical architecture

The system is a single **Next.js (App Router) application** that contains the entire RAG pipeline — there is no separate backend service, vector database server, or orchestration layer to operate. It runs identically on a laptop and on Vercel's serverless platform, and the whole retrieval path works with zero API keys; a key is only needed for the final language-model reply.

**Build-time / offline stage.** Source documents live as cited Markdown files in `data/corpus/`. An ingestion script (`scripts/ingest.ts`) reads each file, parses its citation frontmatter with `gray-matter`, splits the body into paragraph-aware overlapping chunks (~900 chars with ~150-char overlap), embeds every chunk, and writes a single self-contained index to `data/vectors.json`. The index records which embedding backend and dimensionality produced it, so queries are always embedded in the same vector space. This file *is* the vector store — it is committed to the repo and traced into the serverless function bundle, which is why retrieval works in production without provisioning any external database.

**Runtime / request lifecycle.** The browser (a React client, `components/Chat.tsx`) keeps the full multi-turn conversation in state and POSTs it to one API route, `app/api/chat/route.ts`. That route handler performs four steps in sequence: first it **retrieves** — embedding the latest user question with the same backend that built the index and running a brute-force top-k cosine search over the in-memory chunks; then it **assembles** — building the LKY persona system prompt and injecting the retrieved passages as a numbered, citation-tagged context block, grounding only the current turn while passing prior turns verbatim to preserve memory; then it **generates** — streaming the answer from the language model via the Vercel AI SDK (`streamText`); and finally it **returns** — streaming the reply text to the client while attaching the retrieved sources (title, work/year, score, snippet, full citation) in a base64 `x-lky-sources` response header so the UI can render the Sources panel immediately, even before — or without — any generated text.

**Abstraction seams.** Two concerns are deliberately isolated behind narrow interfaces so they can be swapped without touching the rest of the pipeline. Embeddings sit behind an `Embedder` interface (`lib/embeddings.ts`) with two interchangeable backends — a keyless local feature-hashing embedder for offline demos and real dense embeddings via the AI Gateway for production. The vector store is isolated behind three functions — `saveVectorStore` / `loadVectorStore` / `search` (`lib/vector-store.ts`) — so migrating to Supabase pgvector, Pinecone, Chroma, or Weaviate means reimplementing only those three. Likewise, model selection is centralized in `lib/model.ts`, which auto-detects whether a Google AI Studio (Gemini) key or a Vercel AI Gateway key is present and returns the appropriate provider-agnostic model handle.

**Stack & deployment.** Frontend and backend are one Next.js 15 / React 19 codebase; generation uses the Vercel AI SDK v5 against Gemini (`gemini-2.5-flash`) or, alternatively, Claude through the AI Gateway. It deploys to Vercel with the model key stored as an encrypted environment variable and the committed vector index bundled into the function, and it auto-redeploys on every push to `main`. A `Dockerfile` and `docker-compose.yml` provide an equivalent container path (the image build runs ingestion then the Next.js build), including a commented pgvector service as a starting point for an external vector store.

## Limitations

- The default local embedder is **lexical**, not deeply semantic — fine for a compact curated corpus; switch to `EMBEDDING_PROVIDER=gateway` for paraphrase-robust retrieval and higher absolute similarity scores.
- Coverage and faithfulness scale with the breadth of sourced material added.
- The demo runs on a **free-tier Gemini key (5 req/min)**, which rate-limits rapid/concurrent use and the full LLM-as-judge eval.
- This is an emulation for education and exploration — not the real Lee Kuan Yew, and quotations should be verified against primary archives before authoritative citation.
