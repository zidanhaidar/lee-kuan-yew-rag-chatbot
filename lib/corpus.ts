import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { chunkDocument } from "./chunk";
import type { Chunk, SourceMeta } from "./types";

export const CORPUS_DIR = join(process.cwd(), "data", "corpus");

/** Read every markdown source file and turn it into citation-carrying chunks. */
export function loadCorpusChunks(): Chunk[] {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md"));
  const chunks: Chunk[] = [];

  for (const file of files) {
    const raw = readFileSync(join(CORPUS_DIR, file), "utf8");
    const { data, content } = matter(raw);

    const meta: SourceMeta = {
      id: String(data.id ?? file.replace(/\.md$/, "")),
      title: String(data.title ?? file),
      work: String(data.work ?? ""),
      year: data.year ?? "",
      type: String(data.type ?? "document"),
      source: String(data.source ?? ""),
      url: String(data.url ?? ""),
      theme: String(data.theme ?? ""),
    };

    chunks.push(...chunkDocument(content.trim(), meta));
  }

  return chunks;
}
