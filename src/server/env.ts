import "server-only";

/** Server-side config. Keys never leave the server. */
export const env = {
  googleKey: process.env.GOOGLE_MAPS_API_KEY || null,
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  // Ranking ~20 places into short picks is a light task: the smallest current model does it
  // for about a tenth of a cent per search. Set ANTHROPIC_MODEL to use a larger one.
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
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
