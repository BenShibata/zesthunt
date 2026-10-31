"use client";

import { useCallback, useRef, useState } from "react";

/*
 * Hold-to-speak using the Web Speech API in on-device mode only
 * (`processLocally = true`). The spec requires local processing in that mode and
 * errors out rather than falling back to a server, so audio never leaves the phone.
 * Browsers without on-device recognition fall back to typing.
 */

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface RecognitionCtor {
  new (): RecognitionLike;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceFallback = "unsupported" | "preparing" | "denied";

export function useVoice({ onFinal, onFallback }: { onFinal: (text: string) => void; onFallback: (why: VoiceFallback) => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<RecognitionLike | null>(null);
  const transcript = useRef("");
  const wantStop = useRef(false);

  const start = useCallback(async () => {
    const Ctor = getCtor();
    // No on-device API at all (e.g. Safari, Firefox, older Chrome): type instead.
    if (!Ctor || typeof Ctor.available !== "function") return onFallback("unsupported");

    const lang = navigator.language || "en-US";
    const opts = { langs: [lang], processLocally: true };
    let status: Availability;
    try {
      status = await Ctor.available(opts);
    } catch {
      return onFallback("unsupported");
    }
    if (status === "unavailable") return onFallback("unsupported");
    if (status !== "available") {
      // Fetches the browser's on-device language pack (no audio involved). Needs the tap's activation.
      if (status === "downloadable") Ctor.install?.(opts).catch(() => {});
      return onFallback("preparing");
    }
    if (wantStop.current) {
      // Released before we were ready: treat as a tap.
      wantStop.current = false;
      return onFallback("unsupported");
    }

    const r = new Ctor();
    r.lang = lang;
    r.processLocally = true;
    r.interimResults = true;
    r.continuous = true;
    transcript.current = "";
    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      transcript.current = finalText;
      setInterim((finalText + " " + interimText).trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onFallback("denied");
    };
    r.onend = () => {
      setListening(false);
      const text = (transcript.current || "").trim();
      setInterim("");
      rec.current = null;
      if (text) onFinal(text);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      onFallback("unsupported");
    }
  }, [onFinal, onFallback]);

  const stop = useCallback(() => {
    if (rec.current) rec.current.stop();
    else wantStop.current = true;
  }, []);

  const cancel = useCallback(() => {
    rec.current?.abort();
    rec.current = null;
    setListening(false);
    setInterim("");
  }, []);

  return { listening, interim, start, stop, cancel, prime: () => (wantStop.current = false) };
}
