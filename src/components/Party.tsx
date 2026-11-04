"use client";

import { useEffect, useState } from "react";
import type { PartyMember } from "@/lib/types";
import { HeartIcon, PartyIcon } from "./Icons";
import type { PartyResult } from "@/lib/partyResults";
import { QrCode } from "./QrCode";

/** Ticks the clock, so a moved deadline ("+5 min") shows at once. */
function useSecondsLeft(expiresAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((expiresAt - now) / 1000));
}

function Countdown({ seconds }: { seconds: number }) {
  return (
    <span className="tabular-nums" aria-label={`Room closes in ${Math.ceil(seconds / 60)} minutes`}>
      {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </span>
  );
}

/**
 * Opening an invite link joins right away (a food name is handed out, no form), so this
 * screen only shows while joining, or why it couldn't.
 */
export function JoinScreen({ code, busy, error, onRetry, onSolo }: { code: string; busy: boolean; error: string | null; onRetry: () => void; onSolo: () => void }) {
  return (
    <section className="flex flex-1 flex-col justify-center gap-4 px-6" aria-labelledby="join-title" aria-busy={busy}>
      <PartyIcon size={40} className="text-social-bright" />
      <h1 id="join-title" className="font-display text-3xl font-bold tracking-tight">
        {error ? "Couldn't join the hunt" : "Joining the hunt…"}
      </h1>
      <p className="text-white/75">
        Party <span className="font-mono font-semibold tracking-widest text-white">{code}</span>. No account, no form. Gone in 10 minutes.
      </p>
      {error && (
        <>
          <p className="text-paprika-bright" role="alert">
            {error}
          </p>
          <button type="button" onClick={onRetry} className="h-12 self-start rounded-full bg-social px-6 font-semibold text-white">
            Try again
          </button>
        </>
      )}
      <button type="button" onClick={onSolo} className="h-11 self-start rounded-full px-1 text-sm font-semibold text-white/70 underline-offset-4 hover:underline">
        Just hunt solo
      </button>
    </section>
  );
}

/**
 * The invite, shown as soon as a party starts (and from Invite later): a QR code for people
 * standing nearby, the link to share, and your handed-out name with a way to change it.
 */
export function InviteSheet({
  code,
  link,
  nickname,
  memberCount,
  onShare,
  onRename,
  onClose,
}: {
  code: string;
  link: string;
  nickname: string | null;
  memberCount: number;
  onShare: () => void;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  return (
    <section
      aria-labelledby="invite-title"
      className="animate-rise mx-4 max-h-[calc(100dvh-5rem)] space-y-3 overflow-y-auto rounded-3xl bg-[#121a2e] p-4 shadow-2xl ring-1 ring-social/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="invite-title" className="font-display text-xl font-bold">
            Hunt together
          </h2>
          <p className="text-sm text-white/75">
            Everyone swipes the same picks; it&apos;s a match when the group says go. {memberCount > 1 ? `${memberCount} here so far.` : "Bring your people in:"}
          </p>
        </div>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-ink">
          Start swiping
        </button>
      </div>

      <div className="flex items-center gap-4">
        <QrCode text={link} size={132} label={`QR code for party ${code}. Friends nearby can scan it to join.`} />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-white/75">Nearby? They scan this. Not here? Send the link.</p>
          <p className="font-mono text-lg font-semibold tracking-widest">{code}</p>
          <button type="button" onClick={onShare} className="h-11 rounded-full bg-social px-5 text-sm font-semibold text-white">
            Share link
          </button>
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 text-sm">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = draft.trim();
              if (!name) return;
              void onRename(name).then(() => setEditing(false));
            }}
          >
            <label htmlFor="rename" className="sr-only">
              Your name in this party
            </label>
            <input
              id="rename"
              autoFocus
              value={draft}
              maxLength={20}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              autoComplete="nickname"
              className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white"
            />
            <button type="submit" className="h-11 rounded-full bg-white px-4 font-semibold text-ink">
              Save
            </button>
          </form>
        ) : (
          <p className="flex items-center gap-2">
            <span className="text-white/75">
              You&apos;re <span className="font-semibold text-white">{nickname ?? "…"}</span> to the group.
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(nickname ?? "");
                setEditing(true);
              }}
              className="h-11 rounded-full px-1 font-semibold text-social-bright underline-offset-4 hover:underline"
            >
              Rename
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

const initials = (n: string) => n.trim().slice(0, 1).toUpperCase() || "?";

/** Who's finished voting (never what they voted for: that stays secret until the reveal). */
function Avatars({ members, progress, deckSize, meId }: { members: PartyMember[]; progress: Record<string, number>; deckSize: number; meId: string }) {
  return (
    <ul className="flex -space-x-2" aria-label={`In the party: ${members.map((m) => `${m.nickname}${(progress[m.id] ?? 0) >= deckSize && deckSize > 0 ? " (done)" : ""}`).join(", ")}`}>
      {members.map((m) => {
        const done = deckSize > 0 && (progress[m.id] ?? 0) >= deckSize;
        return (
          <li
            key={m.id}
            title={`${m.nickname}${m.id === meId ? " (you)" : ""} · ${Math.min(progress[m.id] ?? 0, deckSize)}/${deckSize} voted`}
            className={`relative grid size-8 place-items-center rounded-full border-2 border-ink text-xs font-bold ${m.id === meId ? "bg-social text-white" : "bg-social-bright text-ink"}`}
          >
            {initials(m.nickname)}
            {done && (
              <span aria-hidden="true" className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-teal-bright text-[9px] text-ink ring-2 ring-ink">
                ✓
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Who's here, the clock, and how the vote ends. Votes are a secret ballot, so the bar only
 * says who has finished. When time is short it offers "Reveal results" (until you're done,
 * when the waiting screen has it) and a one-time "+5 min".
 */
export function PartyBar({
  code,
  expiresAt,
  members,
  progress,
  deckSize,
  meId,
  extended,
  onInvite,
  onLeave,
  onReveal,
  onExtend,
}: {
  code: string;
  expiresAt: number;
  members: PartyMember[];
  progress: Record<string, number>;
  deckSize: number;
  meId: string;
  extended: boolean;
  onInvite: () => void;
  onLeave: () => void;
  onReveal: () => void;
  onExtend: () => void;
}) {
  const seconds = useSecondsLeft(expiresAt);
  const lowTime = seconds <= 120;
  const finished = members.filter((m) => deckSize > 0 && (progress[m.id] ?? 0) >= deckSize).length;
  const allDone = members.length > 1 && finished === members.length;
  const meDone = deckSize > 0 && (progress[meId] ?? 0) >= deckSize;
  // Once you've voted on everything, the reveal lives on the waiting screen instead.
  const canReveal = lowTime && !meDone;
  return (
    <div className="mx-4 mb-2 space-y-1">
      <div className="flex items-center gap-2 rounded-full bg-social/15 py-1 pr-1 pl-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatars members={members} progress={progress} deckSize={deckSize} meId={meId} />
          <span className={`truncate text-sm ${lowTime ? "font-semibold text-paprika-bright" : "text-white/80"}`}>
            <span className="font-mono font-semibold tracking-widest text-white">{code}</span>
            <span aria-hidden="true"> · </span>
            <Countdown seconds={seconds} />
          </span>
        </div>
        <button type="button" onClick={onInvite} className="h-11 rounded-full bg-social px-4 text-sm font-semibold text-white">
          Invite
        </button>
        <button type="button" onClick={onLeave} className="h-11 rounded-full px-3 text-sm font-semibold text-white/75 hover:bg-white/10" aria-label="Leave party">
          Leave
        </button>
      </div>
      <div className="flex min-h-11 items-center gap-2 pl-2 text-sm" aria-live="polite">
        <span className="min-w-0 flex-1 truncate text-white/70">
          {allDone ? (
            <span className="font-semibold text-white">Everyone&apos;s voted!</span>
          ) : members.length < 2 ? (
            "Invite someone to vote with you."
          ) : (
            <>
              <span aria-hidden="true">🔒 </span>Votes are secret · {finished} of {members.length} done
            </>
          )}
        </span>
        {lowTime && !extended && (
          <button type="button" onClick={onExtend} className="h-11 shrink-0 rounded-full px-3 font-semibold text-social-bright hover:bg-white/10">
            +5 min
          </button>
        )}
        {canReveal && (
          <button type="button" onClick={onReveal} className="h-11 shrink-0 rounded-full bg-white px-4 font-semibold text-ink">
            Reveal results
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown once you've voted on every card: who's still going, and the reveal. */
export function PartyWaiting({
  members,
  progress,
  deckSize,
  meId,
  onReveal,
}: {
  members: PartyMember[];
  progress: Record<string, number>;
  deckSize: number;
  meId: string;
  onReveal: () => void;
}) {
  const waiting = members.filter((m) => (progress[m.id] ?? 0) < deckSize);
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center" aria-live="polite">
      <p className="font-display text-2xl font-bold">You&apos;ve voted on all {deckSize}.</p>
      {waiting.length > 0 ? (
        <>
          <ul className="space-y-1 text-white/75">
            {waiting.map((m) => (
              <li key={m.id}>
                {m.nickname}
                {m.id === meId ? " (you)" : ""} is on {Math.min(progress[m.id] ?? 0, deckSize)} of {deckSize}…
              </li>
            ))}
          </ul>
          <button type="button" onClick={onReveal} className="h-12 rounded-full bg-white/12 px-6 font-semibold text-white">
            Reveal now (ends the vote)
          </button>
        </>
      ) : (
        <button type="button" onClick={onReveal} className="h-14 rounded-full bg-white px-8 text-lg font-bold text-ink">
          Reveal results
        </button>
      )}
    </section>
  );
}

/**
 * The reveal: what the group picked, who was in, and the runners-up. Every vote is shown
 * now, and only now.
 */
export function PartyResults({ result, onGo, onLeave }: { result: PartyResult; onGo: () => void; onLeave: () => void }) {
  const { winner, others, voters } = result;
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col justify-center gap-5 bg-ink px-6 text-white">
      <p className="animate-rise text-sm font-semibold tracking-wide text-social-bright uppercase">The group picked…</p>
      <section aria-labelledby="result-title" className="animate-rise space-y-2 rounded-3xl bg-social/20 p-5 ring-1 ring-social/40">
        <h1 id="result-title" className="font-display text-4xl leading-tight font-extrabold tracking-tight">
          {winner.card.name}
        </h1>
        <p className="text-white/80">{winner.card.suggestion}</p>
        <p className="flex items-center gap-1.5 text-lg font-semibold">
          <HeartIcon size={20} className="text-paprika-bright" />
          {winner.likers.length} of {voters} in
        </p>
        {winner.likers.length > 0 && <p className="text-sm text-white/70">{winner.likers.join(", ")}</p>}
      </section>
      {others.length > 0 && (
        <section aria-labelledby="runners-title" className="animate-rise">
          <h2 id="runners-title" className="mb-2 text-sm font-semibold text-white/60">
            Also popular
          </h2>
          <ul className="space-y-1.5">
            {others.map((o) => (
              <li key={o.card.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/6 px-4 py-3">
                <span className="min-w-0 truncate font-semibold">{o.card.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-white/75" aria-label={`${o.likers.length} in: ${o.likers.join(", ")}`}>
                  <HeartIcon size={14} />
                  {o.likers.length}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onGo} autoFocus className="h-14 rounded-2xl bg-paprika text-lg font-semibold text-white shadow-md hover:bg-paprika-deep">
          Let&apos;s go to {winner.card.name}
        </button>
        <button type="button" onClick={onLeave} className="h-11 font-semibold text-white/70 hover:text-white">
          Back to solo picks
        </button>
      </div>
    </main>
  );
}
