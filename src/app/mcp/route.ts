import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/server/mcp";
import { clientIp, rateLimit, safeErrorLabel } from "@/server/memory";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * POST /mcp: Zesthunt as an MCP connector (Streamable HTTP, stateless, no auth).
 * Each request gets a fresh server and transport, so nothing carries over between calls.
 * Requests are never logged; failures log only an error class.
 */
async function handle(request: Request) {
  // Many users share an assistant platform's IPs, so this limit is looser than the app's.
  const limit = await rateLimit(clientIp(request.headers), "mcp", 120);
  if (!limit.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests. Try again shortly." }, id: null },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const server = buildMcpServer(new URL(request.url).origin, request.signal);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(request);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    console.error("mcp failed:", safeErrorLabel(e));
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null },
      { status: 500, headers: NO_STORE },
    );
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
