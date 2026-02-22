"use client";

import Image from "next/image";

type OnboardingModalProps = {
  displayName: string;
  username: string;
  avatarUrl: string;
  avatarSupported: boolean;
  isSaving: boolean;
  error: string | null;
  getInitials: (name: string) => string;
  onDisplayNameChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onAvatarUrlChange: (value: string) => void;
  onPhotoSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
};

export function OnboardingModal({
  displayName,
  username,
  avatarUrl,
  avatarSupported,
  isSaving,
  error,
  getInitials,
  onDisplayNameChange,
  onUsernameChange,
  onAvatarUrlChange,
  onPhotoSelected,
  onSave,
}: OnboardingModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="w-full max-w-lg border border-black/20 bg-white p-5 shadow-xl md:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Complete Profile
        </p>
        <h2 className="mt-2 text-xl font-medium tracking-tight text-neutral-900">
          Pick your username and display name.
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Profile photo is optional and you can change this later.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-16 w-16 overflow-hidden rounded-full border border-black/20 bg-white">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${displayName || "Profile"} avatar`}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            ) : (
              <div className="grid h-full w-full place-items-center font-mono text-xs uppercase tracking-[0.1em] text-neutral-600">
                {getInitials(displayName || "NewSpots User")}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:border-black hover:text-black">
              Upload Photo
              <input
                type="file"
                accept="image/*"
                onChange={onPhotoSelected}
                className="hidden"
                disabled={!avatarSupported}
              />
            </label>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => onAvatarUrlChange("")}
                className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:border-black hover:text-black"
              >
                Remove
              </button>
            ) : null}
            {!avatarSupported ? (
              <p className="w-full text-xs text-neutral-500">
                Apply latest DB migration to enable profile photo storage.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
              Display Name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
              placeholder="Bhagat"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
              Username
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
              placeholder="udtaa_punjabi"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Continue"}
          </button>
          <p className="text-xs text-neutral-600">You can edit this later in Profile.</p>
        </div>
      </div>
    </div>
  );
}
