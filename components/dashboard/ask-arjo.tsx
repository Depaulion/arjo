"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's my balance?",
  "How does SafeLock work?",
  "When's my next contribution due?",
  "How do bonds work?",
];

/**
 * "Ask Arjo" — a floating advisory assistant. Answers questions about the user's
 * savings, circles, goals and yield, and explains how Arjo works. Powered by
 * Claude when configured, with a rule-based fallback otherwise (POST
 * /api/assistant). Advisory only — it never moves money.
 */
export function AskArjo() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => ({}));
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            json.reply ??
            "Sorry — I couldn't answer just now. Please try again.",
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Network hiccup — please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher — bottom-right, clear of the centered tab bar. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Ask Arjo"}
        className="fixed bottom-5 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-105"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl shadow-black/40">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Ask Arjo</p>
              <p className="text-[11px] text-muted-foreground">
                Your savings & circles, explained
              </p>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi 👋 I can explain how Arjo works and answer questions about
                  your savings, circles and yield. Try one:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-foreground"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border/60 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your savings…"
              aria-label="Ask Arjo a question"
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
