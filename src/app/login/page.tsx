"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [lastEmailSentTo, setLastEmailSentTo] = useState<string | null>(null);

  const cleanedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = cleanedEmail.length > 0;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setToast({
        tone: "error",
        text: "Supabase is not configured. Add env vars to continue.",
      });
      setIsCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
        return;
      }
      setIsCheckingSession(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);

    if (!canSubmit) {
      setToast({
        tone: "error",
        text: "Please enter your email.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setToast({
          tone: "error",
          text: "Supabase is not configured. Add env vars to continue.",
        });
        return;
      }

      const emailRedirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: cleanedEmail,
        options: {
          emailRedirectTo,
          shouldCreateUser: true,
        },
      });

      if (signInError) throw signInError;

      setLastEmailSentTo(cleanedEmail);
      setToast({
        tone: "success",
        text: `Magic link sent to ${cleanedEmail}. Open the email and tap the link to log in.`,
      });
    } catch (caughtError) {
      setToast({
        tone: "error",
        text: caughtError instanceof Error ? caughtError.message : "Unable to continue.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f5f2] px-4 py-10 text-neutral-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.04),transparent_45%),linear-gradient(to_bottom,rgba(255,255,255,0.45),rgba(0,0,0,0.015))]" />
      <div className="relative mx-auto mt-8 w-full max-w-md border border-black/20 bg-white/80 p-6 backdrop-blur-[2px] sm:p-8">
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500">
            New Spots Club
          </p>
          <h1 className="mt-3 font-mono text-2xl font-medium tracking-tight">
            Login with a magic link.
          </h1>
          <p className="mt-2 max-w-xs text-sm text-neutral-600">
            Enter your email and we&apos;ll send a one-click sign-in link.
          </p>
        </div>

        {isCheckingSession ? (
          <div className="mb-4 border border-black/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-600">
            Checking session...
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full border border-black/25 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-black"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting || isCheckingSession || !canSubmit}
            className="w-full bg-black px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Sending link..." : "Send magic link"}
          </button>

          {lastEmailSentTo ? (
            <p className="text-xs text-neutral-600">
              Didn&apos;t get it? Check spam, then resend.
            </p>
          ) : null}
        </form>

        <div className="mt-7 text-sm text-neutral-700">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500 underline decoration-black/30 underline-offset-4 transition hover:text-black"
          >
            Back to spots
          </Link>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
              toast.tone === "success"
                ? "border-black/20 bg-white/90 text-neutral-800"
                : "border-red-700/30 bg-red-50/95 text-red-700"
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
    </main>
  );
}
