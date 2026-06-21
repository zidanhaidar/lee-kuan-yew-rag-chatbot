"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";

/**
 * Minimal inline formatter: renders **bold** segments as actual bold text and
 * preserves everything else verbatim. Works mid-stream — an unclosed `**` is
 * left as literal text until its closing pair arrives.
 */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (match) {
      return <strong key={i}>{match[1]}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface Source {
  n: number;
  id: string;
  title: string;
  work: string;
  year: number | string;
  type: string;
  source: string;
  url: string;
  score: number;
  snippet: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  "Is democracy necessary for a country to develop?",
  "How should a small country handle the US–China rivalry?",
  "Why pay government ministers so much?",
  "What would you say about cryptocurrency?",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const history = [...messages, userMsg];
    setMessages([...history, assistantMsg]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      // Sources travel in a header so they're available immediately.
      let sources: Source[] | undefined;
      const header = res.headers.get("x-lky-sources");
      if (header) {
        try {
          sources = JSON.parse(decodeURIComponent(escape(atob(header))));
        } catch {
          sources = undefined;
        }
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, sources } : m))
      );

      if (!res.body) {
        const txt = await res.text();
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: txt } : m))
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m))
        );
        scrollToBottom();
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: "Something went wrong reaching the model. Check the server logs." }
            : m
        )
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  return (
    <div className="chat">
      <div className="toolbar">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSources}
            onChange={(e) => setShowSources(e.target.checked)}
          />
          Show retrieved sources
        </label>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <p className="empty-title">Ask Lee Kuan Yew.</p>
            <p className="empty-sub">
              Answers are retrieved from his documented speeches, memoirs, and interviews,
              then composed in his voice with citations.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="role">{m.role === "user" ? "You" : "LKY (AI emulation)"}</div>
            <div className="bubble">
              {m.content ? renderInline(m.content) : loading ? <span className="cursor">▋</span> : ""}
            </div>
            {showSources && m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <details className="sources" open>
                <summary>{m.sources.length} sources</summary>
                <ol>
                  {m.sources.map((s) => (
                    <li key={s.id + s.n}>
                      <span className="cite-num">[#{s.n}]</span>{" "}
                      <strong>{s.title}</strong> — <em>{s.work}{s.year ? `, ${s.year}` : ""}</em>{" "}
                      <span className="score">(score {s.score})</span>
                      <div className="snippet">“{s.snippet}”</div>
                      <div className="full-cite">{s.source}</div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about governance, geopolitics, life…"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
