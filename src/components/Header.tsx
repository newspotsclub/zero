"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

type HeaderProps = {
  sessionLoading: boolean;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  supabaseConfigured: boolean;
  onSignOut: () => void;
};

export function Header({
  sessionLoading,
  userId,
  userEmail,
  isAdmin,
  supabaseConfigured,
  onSignOut,
}: HeaderProps) {
  return (
    <div className="mb-8 border-b border-black/20 pb-4 md:mb-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-mono text-base uppercase tracking-[0.22em]">
            NewSpots.club
          </h1>
          <p className="mt-1 text-xs text-neutral-600">
            For folks who taste bad coffee and eat bad burgers for their friends.
          </p>
        </div>

        <ThemeToggle />

        {sessionLoading ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Checking ...
          </p>
        ) : userId ? (
          <div className="flex items-center gap-3">
            <p className="hidden max-w-44 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500 sm:block">
              {userEmail}
            </p>
            <Link
              href="/profile"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
            >
              Profile
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
              >
                Admin
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {!supabaseConfigured ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-red-700">
                Supabase not set
              </span>
            ) : null}
            <Link
              href="/login"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
            >
              Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** @deprecated Use Header from this module instead. Kept for backward compatibility. */
export { Header as HomeHeader };
