import "server-only";

/**
 * One setting picks the ranking model: ANTHROPIC_MODEL = haiku (the default), sonnet, opus,
 * off (free rule-based picks, no AI), or any full model ID. Ranking ~20 places is a light
 * task, so the smallest model does it well for about a tenth of a cent per search.
 */
export const MODEL_SHORTCUTS: Record<string, string> = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
};

export function rankingModel(raw: string | undefined): string | null {
  const v = raw?.trim().toLowerCase() || "haiku";
  if (/^(off|none|rules|false|0)$/.test(v)) return null;
  return MODEL_SHORTCUTS[v] ?? raw!.trim();
}

/** Server-side config. Keys never leave the server. */
export const env = {
  googleKey: process.env.GOOGLE_MAPS_API_KEY || null,
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  /** The model that ranks picks, or null for the free rule-based picks. See `rankingModel`. */
  anthropicModel: rankingModel(process.env.ANTHROPIC_MODEL),
  /**
   * Off by default: walk and drive times are estimated from distance (shown with "~"),
   * which costs nothing. Set USE_ROUTES_API=true to pay for Google Routes times instead.
   */
  useRoutes: process.env.USE_ROUTES_API === "true",
  /** Most live place searches the MCP connector may run per UTC day, across all callers. */
  mcpDailyLimit: Number(process.env.MCP_DAILY_LIMIT) || 2000,
};

/** No Google key: serve fictional mock places through the same pipeline. */
export const isDemo = () => !env.googleKey;
