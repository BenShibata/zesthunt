import "server-only";

/** Server-side config. Keys never leave the server. */
export const env = {
  googleKey: process.env.GOOGLE_MAPS_API_KEY || null,
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
};

/** No Google key: serve fictional mock places through the same pipeline. */
export const isDemo = () => !env.googleKey;
