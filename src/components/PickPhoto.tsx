/* eslint-disable @next/next/no-img-element -- Places photos are proxied per request; next/image adds nothing here. */
import { useEffect, useState } from "react";
import type { PickPhoto as Photo } from "@/lib/types";

/**
 * Each Places photo is a paid call, so it loads only once a card has been on screen this
 * long: quick skips cost nothing. The card shows a soft gradient until then.
 */
const PHOTO_DELAY_MS = 900;

/** While a photo loads: the place's own color and a symbol for its food, so no two picks look alike. */
export interface PhotoTint {
  hue: number;
  symbol: string;
}

function Placeholder({ alt, tint }: { alt: string; tint?: PhotoTint }) {
  if (!tint) return <div role="img" aria-label={alt} className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,#2a2620_0%,#141210_70%)]" />;
  return (
    <div
      role="img"
      aria-label={alt}
      className="absolute inset-0 grid place-items-center"
      style={{ background: `radial-gradient(120% 90% at 50% 38%, hsl(${tint.hue} 42% 30%) 0%, hsl(${tint.hue} 35% 12%) 72%)` }}
    >
      <span aria-hidden="true" className="text-[7rem] leading-none opacity-70 drop-shadow-lg select-none">
        {tint.symbol}
      </span>
    </div>
  );
}

function RemotePhoto({ url, alt, instant, tint }: { url: string; alt: string; instant?: boolean; tint?: PhotoTint }) {
  const [ready, setReady] = useState(Boolean(instant));
  useEffect(() => {
    if (instant) return;
    const t = setTimeout(() => setReady(true), PHOTO_DELAY_MS);
    return () => clearTimeout(t);
  }, [url, instant]);
  if (!ready) return <Placeholder alt={alt} tint={tint} />;
  // Not draggable: the browser's own image drag would cancel a swipe or pull mid-gesture.
  return (
    <img src={url} alt={alt} referrerPolicy="no-referrer" draggable={false} className="animate-develop pointer-events-none absolute inset-0 size-full object-cover select-none" />
  );
}

/**
 * Edge-to-edge photo for a pick: the Places photo, served through our own proxy so
 * the key and the user's IP never reach Google from the browser. Demo places (and
 * places without photos) get a painterly placeholder from a palette.
 */
export function PickPhoto({ photo, alt, instant, tint }: { photo: Photo; alt: string; /** Asked for (a flip): no delay. */ instant?: boolean; tint?: PhotoTint }) {
  if (photo.kind === "url") return <RemotePhoto key={photo.url} url={photo.url} alt={alt} instant={instant} tint={tint} />;

  const [a, b, c] = photo.palette;
  const layers: Record<typeof photo.motif, string> = {
    bowl: `radial-gradient(circle at 43% 50%, ${a} 0 8%, transparent 9%),
      radial-gradient(circle at 58% 60%, ${b} 0 10%, transparent 11%),
      radial-gradient(circle at 57% 46%, ${a}cc 0 6%, transparent 7%),
      radial-gradient(circle at 44% 63%, ${b}dd 0 6%, transparent 7%),
      radial-gradient(circle at 50% 56%, ${c} 0 24%, transparent 25%),
      radial-gradient(circle at 50% 56%, #f6f1e7 0 33%, #d9d1c3 34% 36%, transparent 37%)`,
    plate: `radial-gradient(ellipse 30% 18% at 48% 54%, ${a} 0 60%, transparent 62%),
      radial-gradient(ellipse 16% 14% at 62% 48%, ${b} 0 60%, transparent 62%),
      radial-gradient(circle at 36% 60%, ${c} 0 9%, transparent 10%),
      radial-gradient(circle at 50% 55%, #f7f3ea 0 36%, #ddd4c4 37% 39%, transparent 40%)`,
    wrap: `linear-gradient(115deg, transparent 30%, ${c} 30% 62%, transparent 62%),
      radial-gradient(ellipse 20% 10% at 52% 44%, ${b} 0 60%, transparent 62%),
      radial-gradient(ellipse 18% 9% at 46% 50%, ${a} 0 60%, transparent 62%)`,
    cup: `radial-gradient(circle at 50% 40%, ${a} 0 12%, transparent 13%),
      radial-gradient(circle at 44% 46%, ${c} 0 10%, transparent 11%),
      linear-gradient(180deg, transparent 46%, ${b} 46% 72%, transparent 72%)`,
  };

  return (
    <div role="img" aria-label={alt} className="animate-develop absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `${layers[photo.motif]}, radial-gradient(120% 90% at 50% 40%, ${b}55 0%, #1a1410 70%)`,
          backgroundColor: "#1a1410",
        }}
      />
      {/* Film grain so it reads as a photo, not a flat illustration */}
      <svg className="absolute inset-0 size-full opacity-25 mix-blend-overlay" aria-hidden="true">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.65)]" />
    </div>
  );
}
