"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const passwordMismatch =
    mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (mode === "signup") {
      if (password.length < 6) return false;
      if (!confirmPassword) return false;
      if (password !== confirmPassword) return false;
    }
    return true;
  }, [confirmPassword, email, mode, password]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured. Add env vars to continue.");
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
  }, [router]);

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!canSubmit) {
      setError(
        mode === "signup"
          ? "Please complete all fields and ensure passwords match."
          : "Please enter email and password.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase is not configured. Add env vars to continue.");
        return;
      }

      if (mode === "signup") {
        const emailRedirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/login`
            : undefined;

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });

        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace("/");
          return;
        }

        setMessage("Account created. Check your inbox to verify your email.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        router.replace("/");
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to continue.",
      );
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
            {mode === "signin" ? "Welcome back." : "Create account."}
          </h1>
          <p className="mt-2 max-w-xs text-sm text-neutral-600">
            Save favorites and track places you have already visited.
          </p>
        </div>

        <div className="mb-7 grid grid-cols-2 border border-black/20 p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition ${
              mode === "signin"
                ? "bg-black text-white"
                : "text-neutral-500 hover:text-black"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition ${
              mode === "signup"
                ? "bg-black text-white"
                : "text-neutral-500 hover:text-black"
            }`}
          >
            Create account
          </button>
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

          <label className="block">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              Password
            </span>
            <div className="flex items-center border border-black/25 pr-2 transition focus-within:border-black">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
                className="w-full border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 transition hover:text-black"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {mode === "signup" ? (
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                Confirm password
              </span>
              <div className="flex items-center border border-black/25 pr-2 transition focus-within:border-black">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={6}
                  required
                  className="w-full border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 transition hover:text-black"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              {passwordMismatch ? (
                <p className="mt-2 text-xs text-red-700">Passwords do not match.</p>
              ) : null}
            </label>
          ) : null}

          {error ? (
            <p className="border border-red-700/35 bg-red-50/70 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="border border-emerald-700/35 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || isCheckingSession || !canSubmit}
            className="w-full bg-black px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
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
    </main>
  );
}
