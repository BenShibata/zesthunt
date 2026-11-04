import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * A QR code drawn on the phone as SVG, for friends standing nearby to scan. Nothing about it
 * leaves the device: no image service, no tracking link, just the party link itself.
 */
export function QrCode({ text, size = 176, label }: { text: string; size?: number; label: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { n: count, d: path };
  }, [text]);
  return (
    <svg viewBox={`-3 -3 ${n + 6} ${n + 6}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="rounded-2xl">
      <rect x={-3} y={-3} width={n + 6} height={n + 6} fill="#fff" />
      <path d={d} fill="#0b0b0c" />
    </svg>
  );
}
