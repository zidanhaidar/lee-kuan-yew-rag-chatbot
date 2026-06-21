import type { Chunk, SourceMeta } from "./types";

const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 900);
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP ?? 150);

/**
 * Paragraph-aware chunking with character overlap.
 *
 * We first split on blank lines (paragraphs) so we never cut mid-sentence when
 * we can avoid it, then greedily pack paragraphs up to ~CHUNK_SIZE characters.
 * Consecutive chunks share ~CHUNK_OVERLAP characters of tail context so a
 * passage that straddles a boundary is still retrievable.
 */
export function chunkDocument(
  text: string,
  meta: SourceMeta,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): Chunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (!current) {
      current = para;
    } else if (current.length + para.length + 1 <= size) {
      current += " " + para;
    } else {
      chunks.push(current);
      // Start the next chunk with an overlapping tail of the previous one.
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = (tail + " " + para).trim();
    }
  }
  if (current) chunks.push(current);

  // A single very long paragraph may still exceed `size`; hard-split it.
  const sized: string[] = [];
  for (const c of chunks) {
    if (c.length <= size * 1.5) {
      sized.push(c);
    } else {
      for (let i = 0; i < c.length; i += size - overlap) {
        sized.push(c.slice(i, i + size));
      }
    }
  }

  return sized.map((t, i) => ({
    id: `${meta.id}#${i}`,
    text: t,
    chunkIndex: i,
    meta,
  }));
}
