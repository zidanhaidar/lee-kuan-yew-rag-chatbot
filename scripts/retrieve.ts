import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { retrieve } from "../lib/retrieval";

// Quick CLI to sanity-check retrieval without the LLM:
//   npm run retrieve -- "what did LKY think about democracy?"
async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run retrieve -- "your question"');
    process.exit(1);
  }

  const results = await retrieve(query, 6, 0);
  console.log(`\nQuery: ${query}\n`);
  for (const r of results) {
    console.log(`  [${r.score.toFixed(3)}] ${r.meta.title} (${r.meta.work}, ${r.meta.year})`);
    console.log(`        ${r.text.slice(0, 140)}…\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
