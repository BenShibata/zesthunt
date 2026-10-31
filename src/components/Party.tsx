"use client";

import { useEffect, useState } from "react";
import type { PartyMember } from "@/lib/types";
import { PartyIcon } from "./Icons";

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [left, setLeft] = useState(() => expiresAt - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(expiresAt - Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const s = Math.max(0, Math.floor(left / 1000));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <span className="tabular-nums" aria-label={`Room closes in ${Math.ceil(s / 60)} minutes`}>
      {text}
    </span>
  );
}

function NicknameForm({ cta, onSubmit, busy }: { cta: string; onSubmit: (name: string) => void; busy: boolean }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <label htmlFor="nickname" className="sr-only">
        Your nickname
      </label>
      <input
        id="nickname"
        autoFocus
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your nickname"
        autoComplete="nickname"
        className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white placeholder:text-white/50"
      />
      <button type="submit" disabled={busy || !name.trim()} className="h-12 rounded-full bg-social px-5 font-semibold text-white transition disabled:opacity-50">
        {busy ? "…" : cta}
      </button>
    </form>
  );
}

/** Inline (not a modal): drops in under the top bar when Party is tapped. */
export function PartySetup({ onStart, onCancel, busy, error }: { onStart: (name: string) => void; onCancel: () => void; busy: boolean; error: string | null }) {
  return (
    <section className="animate-rise mx-4 mb-3 space-y-3 rounded-3xl bg-social/15 p-4" aria-labelledby="party-setup-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="party-setup-title" className="font-display text-xl font-bold">
            Hunt together
          </h2>
          <p className="text-sm text-white/75">Everyone swipes the same picks. When you all say go, it&apos;s a match. The room vanishes after 10 minutes.</p>
        </div>
        <button type="button" onClick={onCancel} className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-white/75 hover:bg-white/10">
          Cancel
        </button>
      </div>
      <NicknameForm cta="Start" onSubmit={onStart} busy={busy} />
      {error && <p className="text-sm text-paprika-bright">{error}</p>}
    </section>
  );
}

export function JoinScreen({
  code,
  onJoin,
  onSolo,
  busy,
  error,
}: {
  code: string;
  onJoin: (name: string) => void;
  onSolo: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <section className="flex flex-1 flex-col justify-center gap-4 px-6" aria-labelledby="join-title">
      <PartyIcon size={40} className="text-social-bright" />
      <h1 id="join-title" className="font-display text-3xl font-bold tracking-tight">
        Join the hunt
      </h1>
      <p className="text-white/75">
        Party <span className="font-mono font-semibold tracking-widest text-white">{code}</span>. Just a nickname, no account. Gone in 10 minutes.
      </p>
      <NicknameForm cta="Join" onSubmit={onJoin} busy={busy} />
      {error && <p className="text-sm text-paprika-bright">{error}</p>}
      <button type="button" onClick={onSolo} className="h-11 self-start rounded-full px-1 text-sm font-semibold text-white/70 underline-offset-4 hover:underline">
        Just hunt solo
      </button>
    </section>
  );
}

const initials = (n: string) => n.trim().slice(0, 1).toUpperCase() || "?";

export function PartyBar({
  code,
  expiresAt,
  members,
  progress,
  meId,
  onShare,
  onLeave,
}: {
  code: string;
  expiresAt: number;
  members: PartyMember[];
  progress: Record<string, number>;
  meId: string;
  onShare: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-full bg-social/15 py-1 pr-1 pl-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ul className="flex -space-x-2" aria-label={`In the party: ${members.map((m) => m.nickname).join(", ")}`}>
          {members.map((m) => (
            <li
              key={m.id}
              title={`${m.nickname}${m.id === meId ? " (you)" : ""} · ${progress[m.id] ?? 0} swiped`}
              className={`grid size-8 place-items-center rounded-full border-2 border-ink text-xs font-bold ${m.id === meId ? "bg-social text-white" : "bg-social-bright text-ink"}`}
            >
              {initials(m.nickname)}
            </li>
          ))}
        </ul>
        <span className="truncate text-sm text-white/80">
          <span className="font-mono font-semibold tracking-widest text-white">{code}</span>
          <span aria-hidden="true"> · </span>
          <Countdown expiresAt={expiresAt} />
        </span>
      </div>
      <button type="button" onClick={onShare} className="h-11 rounded-full bg-social px-4 text-sm font-semibold text-white">
        Invite
      </button>
      <button type="button" onClick={onLeave} className="h-11 rounded-full px-3 text-sm font-semibold text-white/75 hover:bg-white/10" aria-label="Leave party">
        Leave
      </button>
    </div>
  );
}
