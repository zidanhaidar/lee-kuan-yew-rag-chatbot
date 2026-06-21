import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retrieve } from "../lib/retrieval";
import { PERSONA_SYSTEM_PROMPT, buildContextMessage } from "../lib/persona";
import { getChatModel, hasGenerationKey } from "../lib/model";

interface EvalQuestion {
  id: string;
  question: string;
  expected_sources: string[];
  known_position: string;
  type: "sourced" | "inference";
}

const hasKey = hasGenerationKey();

const JUDGE_RUBRIC = `You are a strict evaluator of a chatbot that emulates Lee Kuan Yew using retrieval-augmented generation. You are given: the user QUESTION, the retrieved SOURCE PASSAGES, the model ANSWER, and the KNOWN LKY POSITION. Score the ANSWER 1-5 on each dimension:

- faithfulness: Are claims grounded in the SOURCE PASSAGES, with no fabricated quotes/positions? (5 = fully grounded, 1 = fabricated)
- persona: Does it read in LKY's documented voice — pragmatic, direct, strategic? (5 = strongly in character)
- refusal_to_fabricate: For out-of-corpus topics, does it clearly flag inference vs sourced view rather than inventing quotes? For in-corpus topics, does it avoid overclaiming? (5 = handled honestly)
- relevance: Does it actually answer the question? (5 = directly answers)
- consistency_with_known_position: Does it align with the KNOWN LKY POSITION? (5 = aligns)

Respond with ONLY a JSON object: {"faithfulness":n,"persona":n,"refusal_to_fabricate":n,"relevance":n,"consistency_with_known_position":n,"rationale":"one sentence"}`;

async function generateAnswer(q: string) {
  const { generateText } = await import("ai");
  const chunks = await retrieve(q);
  const { text } = await generateText({
    model: getChatModel()!,
    system: PERSONA_SYSTEM_PROMPT,
    prompt: buildContextMessage(q, chunks),
  });
  return { text, chunks };
}

async function judge(q: EvalQuestion, answer: string, contextBlock: string) {
  const { generateText } = await import("ai");
  const { text } = await generateText({
    model: getChatModel()!,
    system: JUDGE_RUBRIC,
    prompt: `QUESTION: ${q.question}\n\nSOURCE PASSAGES:\n${contextBlock}\n\nANSWER:\n${answer}\n\nKNOWN LKY POSITION: ${q.known_position}`,
  });
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

async function main() {
  const questions: EvalQuestion[] = JSON.parse(
    readFileSync(join(process.cwd(), "eval", "questions.json"), "utf8")
  );

  const results: any[] = [];
  let retrievalHits = 0;
  let retrievalApplicable = 0;

  for (const q of questions) {
    const chunks = await retrieve(q.question);
    const retrievedIds = [...new Set(chunks.map((c) => c.meta.id))];

    // Retrieval metric: did we surface at least one expected source?
    let retrievalHit: boolean | null = null;
    if (q.expected_sources.length > 0) {
      retrievalApplicable++;
      retrievalHit = q.expected_sources.some((s) => retrievedIds.includes(s));
      if (retrievalHit) retrievalHits++;
    }

    const row: any = {
      id: q.id,
      question: q.question,
      type: q.type,
      expected_sources: q.expected_sources,
      retrieved_sources: retrievedIds,
      retrieval_hit: retrievalHit,
    };

    if (hasKey) {
      const { text } = await generateAnswer(q.question);
      row.answer = text;
      row.cites = /\[#\d+\]/.test(text);
      const contextBlock = buildContextMessage(q.question, chunks);
      try {
        row.judge = await judge(q, text, contextBlock);
      } catch (e) {
        row.judge = { error: String(e) };
      }
    }

    results.push(row);
    console.log(
      `${q.id}: retrieval_hit=${retrievalHit}` +
        (row.judge && !row.judge.error
          ? ` | faith=${row.judge.faithfulness} persona=${row.judge.persona} refuse=${row.judge.refusal_to_fabricate} rel=${row.judge.relevance}`
          : "")
    );
  }

  const summary: any = {
    retrieval_recall_at_k:
      retrievalApplicable > 0 ? +(retrievalHits / retrievalApplicable).toFixed(3) : null,
    generation_evaluated: hasKey,
  };

  if (hasKey) {
    const judged = results.filter((r) => r.judge && !r.judge.error);
    const avg = (k: string) =>
      judged.length ? +(judged.reduce((s, r) => s + (r.judge[k] ?? 0), 0) / judged.length).toFixed(2) : null;
    summary.avg_faithfulness = avg("faithfulness");
    summary.avg_persona = avg("persona");
    summary.avg_refusal_to_fabricate = avg("refusal_to_fabricate");
    summary.avg_relevance = avg("relevance");
    summary.avg_consistency = avg("consistency_with_known_position");
    summary.pct_with_citations = +(
      results.filter((r) => r.cites).length / results.length
    ).toFixed(2);
  }

  writeFileSync(
    join(process.cwd(), "eval", "results.json"),
    JSON.stringify({ summary, results }, null, 2)
  );

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  if (!hasKey) {
    console.log(
      "\n(No AI_GATEWAY_API_KEY set — only retrieval metrics computed. Add a key to run generation + LLM-as-judge.)"
    );
  }
  console.log("\nFull results written to eval/results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
