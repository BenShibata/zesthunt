"use client";

import { useEffect, useState } from "react";
import type { PartyMember } from "@/lib/types";
import { PartyIcon } from "./Icons";
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

/**
 * Who's here, the clock, and the ways to finish: "Decide for us" once anything has a "go",
 * the top pick so far as time runs low, and a one-time "+5 min".
 */
export function PartyBar({
  code,
  expiresAt,
  members,
  progress,
  meId,
  topPick,
  extended,
  onInvite,
  onLeave,
  onDecide,
  onExtend,
}: {
  code: string;
  expiresAt: number;
  members: PartyMember[];
  progress: Record<string, number>;
  meId: string;
  /** The most-liked card so far, if any. */
  topPick: { name: string; likes: number } | null;
  extended: boolean;
  onInvite: () => void;
  onLeave: () => void;
  onDecide: () => void;
  onExtend: () => void;
}) {
  const seconds = useSecondsLeft(expiresAt);
  const lowTime = seconds <= 120;
  return (
    <div className="mx-4 mb-2 space-y-1.5">
      <div className="flex items-center gap-2 rounded-full bg-social/15 py-1 pr-1 pl-3">
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
      {(topPick || (lowTime && !extended)) && (
        <div className="flex items-center gap-2 pl-2 text-sm">
          {topPick && (
            <span className="min-w-0 flex-1 truncate text-white/75">
              {/* When time is short, the name is what matters; the button says what to do with it. */}
              {lowTime ? <span className="sr-only">Top pick so far: </span> : "Leading: "}
              <span className="font-semibold text-white">{topPick.name}</span> <span aria-hidden="true">♥</span>
              <span className="sr-only">, liked by</span> {topPick.likes}
            </span>
          )}
          {lowTime && !extended && (
            <button type="button" onClick={onExtend} className="ml-auto h-11 shrink-0 rounded-full px-3 font-semibold text-social-bright hover:bg-white/10">
              +5 min
            </button>
          )}
          {topPick && (
            <button type="button" onClick={onDecide} className={`${lowTime && !extended ? "" : "ml-auto"} h-11 shrink-0 rounded-full bg-white px-4 font-semibold text-ink`}>
              {lowTime ? "Go with it" : "Decide for us"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
