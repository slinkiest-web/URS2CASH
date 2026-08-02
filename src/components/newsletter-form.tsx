"use client";

import { useActionState, useState } from "react";
import { subscribeToNewsletter } from "@/lib/actions/newsletter";

type FormState = { error?: string; success?: boolean };

export function NewsletterForm() {
  const [email, setEmail] = useState("");

  async function submit(): Promise<FormState> {
    const result = await subscribeToNewsletter(email);
    if (!result.ok) {
      return { error: result.error.message };
    }
    setEmail("");
    return { success: true };
  }

  const [state, formAction, pending] = useActionState(submit, {});

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="h-11 flex-1 rounded-[var(--u2c-radius-control)] border border-white/20 bg-white/10 px-3 text-[15px] text-white outline-none placeholder:text-white/50 focus:border-white focus:ring-2 focus:ring-white/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 shrink-0 rounded-[var(--u2c-radius-control)] bg-white px-6 text-[13px] font-bold uppercase tracking-[0.04em] text-u2c-ink transition-colors duration-150 hover:bg-white/90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Subscribe"}
        </button>
      </div>
      {state.error ? (
        <p className="text-[13px] text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-[13px] text-white/80">You are on the list.</p> : null}
    </form>
  );
}
