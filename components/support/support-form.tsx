"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";

/**
 * Lets a signed-in member open a support ticket. Writes directly to the
 * owner-scoped `support_tickets` table (RLS enforces user_id = auth.uid() and
 * status = 'open'), mirroring the inline-insert pattern used by the Goals tab.
 */
export function SupportForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3) {
      setError("Add a short subject (at least 3 characters).");
      return;
    }
    if (message.trim().length < 10) {
      setError("Tell us a bit more — at least 10 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: userId,
      subject: subject.trim(),
      category,
      message: message.trim(),
      status: "open",
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubject("");
    setCategory("general");
    setMessage("");
    setSent(true);
    router.refresh();
  }

  const fieldClass =
    "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  if (sent) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 text-base font-semibold">Message sent</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Thanks for reaching out — we&apos;ve logged your request and will get
          back to you. You can track its status below.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setSent(false)}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="support-subject" className="text-sm font-medium">
            Subject
          </label>
          <input
            id="support-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={140}
            placeholder="Briefly, what's up?"
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-category" className="text-sm font-medium">
            Topic
          </label>
          <select
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            className={fieldClass}
          >
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-message" className="text-sm font-medium">
          How can we help?
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={6}
          placeholder="Share as much detail as you can — what happened, what you expected, and any circle or transaction involved."
          className={`${fieldClass} resize-y`}
        />
        <p className="text-right text-xs text-muted-foreground">
          {message.length}/4000
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Send message
      </Button>
    </form>
  );
}
