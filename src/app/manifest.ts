import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zesthunt",
    short_name: "Zesthunt",
    description: "Decide what to eat in seconds. Nothing is saved by us.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
