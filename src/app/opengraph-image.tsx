import { ImageResponse } from "next/og";

export const alt = "Zesthunt: what to eat, in seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview: the brand, on the app's dark background. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0b0b0c", color: "white" }}>
        <div style={{ fontSize: 44, color: "#ff7a57", fontWeight: 800 }}>zesthunt</div>
        <div style={{ fontSize: 84, fontWeight: 800, marginTop: 20, lineHeight: 1.05 }}>What to eat, in seconds</div>
        <div style={{ fontSize: 36, marginTop: 28, color: "rgba(255,255,255,0.75)" }}>One open place near you. No login. Nothing kept on our servers.</div>
      </div>
    ),
    size,
  );
}
