import { streamText } from "ai";
import { retrieve } from "@/lib/retrieval";
import { PERSONA_SYSTEM_PROMPT, buildContextMessage } from "@/lib/persona";

export const maxDuration = 60;

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ClientMessage[] };

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content?.trim() ?? "";

  if (!question) {
    return new Response("Ask me something.", { status: 400 });
  }

  // --- Retrieval --------------------------------------------------------
  const chunks = await retrieve(question);
  const sources = chunks.map((c, i) => ({
    n: i + 1,
    id: c.meta.id,
    title: c.meta.title,
    work: c.meta.work,
    year: c.meta.year,
    type: c.meta.type,
    source: c.meta.source,
    url: c.meta.url,
    score: +c.score.toFixed(3),
    snippet: c.text.length > 320 ? c.text.slice(0, 320) + "…" : c.text,
  }));
  // Base64 so non-ASCII citation text is header-safe.
  const sourcesHeader = Buffer.from(JSON.stringify(sources)).toString("base64");

  // --- No key: still return retrieved sources + a setup message ---------
  if (!process.env.AI_GATEWAY_API_KEY) {
    const setup =
      "⚠️ Retrieval is working (open “Sources” to see the grounded passages), " +
      "but the language model isn’t configured yet, so I can’t compose the spoken reply.\n\n" +
      "Add an `AI_GATEWAY_API_KEY` to `.env.local` (see `.env.example`) and restart. " +
      "Get a key at https://vercel.com/ai-gateway.";
    return new Response(setup, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-lky-sources": sourcesHeader,
      },
    });
  }

  // --- Generation: ground the current turn, keep prior turns for memory -
  const modelMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  for (let i = modelMessages.length - 1; i >= 0; i--) {
    if (modelMessages[i].role === "user") {
      modelMessages[i] = { role: "user", content: buildContextMessage(question, chunks) };
      break;
    }
  }

  const result = streamText({
    model: process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-4-6",
    system: PERSONA_SYSTEM_PROMPT,
    messages: modelMessages,
    temperature: 0.4,
  });

  return result.toTextStreamResponse({
    headers: { "x-lky-sources": sourcesHeader },
  });
}
