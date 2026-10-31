import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "./env";
import { RankedPickSchema, RankingSchema, SYSTEM_PROMPT, buildUserMessage, type CandidateForPrompt, type RankedPick } from "./prompts";

let client: Anthropic | null = null;
function getClient() {
  // Retries are cheap insurance here, but keep them low: the user is waiting.
  client ??= new Anthropic({ apiKey: env.anthropicKey!, maxRetries: 1, timeout: 20_000 });
  return client;
}

/**
 * Emits each complete object inside the top-level "picks" array as soon as its
 * closing brace streams in, so the first pick can be shown before the rest are written.
 */
export function createPicksScanner(onObject: (json: string) => void) {
  let buf = "";
  let pos = 0;
  let arrayStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  return (chunk: string) => {
    buf += chunk;
    if (arrayStart < 0) {
      const m = /"picks"\s*:\s*\[/.exec(buf);
      if (!m) return;
      arrayStart = m.index + m[0].length;
      pos = arrayStart;
    }
    for (; pos < buf.length; pos++) {
      const c = buf[pos];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") {
        if (depth === 0) objStart = pos;
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0 && objStart >= 0) {
          onObject(buf.slice(objStart, pos + 1));
          objStart = -1;
        }
      }
    }
  };
}

/**
 * Asks Claude to rank and describe the candidates. Yields validated picks in order,
 * dropping any id that isn't one of the real candidates.
 */
export async function* rankWithClaude(
  params: Parameters<typeof buildUserMessage>[0],
  signal: AbortSignal,
): AsyncGenerator<RankedPick> {
  const valid = new Set(params.candidates.map((c: CandidateForPrompt) => c.id));
  const seen = new Set<string>();
  const queue: RankedPick[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;

  const scan = createPicksScanner((json) => {
    try {
      const parsed = RankedPickSchema.safeParse(JSON.parse(json));
      if (!parsed.success) return;
      const pick = parsed.data;
      if (!valid.has(pick.id) || seen.has(pick.id)) return; // never invent, never repeat
      seen.add(pick.id);
      queue.push(pick);
      wake?.();
    } catch {
      // A malformed object is skipped; the rest of the stream continues.
    }
  });

  const stream = getClient().beta.messages.stream(
    {
      model: env.anthropicModel,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      // If a safety classifier declines, the API retries on a recommended fallback model.
      fallbacks: "default",
      // Ranking ~20 places is a light task and the user is waiting: keep effort low.
      output_config: { effort: "low", format: betaZodOutputFormat(RankingSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(params) }],
    },
    { signal },
  );

  stream.on("text", (delta) => scan(delta));
  stream
    .finalMessage()
    .then((msg) => {
      if (msg.stop_reason === "refusal") failure = new Error("ranking refused");
    })
    .catch((e) => {
      failure = e;
    })
    .finally(() => {
      finished = true;
      wake?.();
    });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (finished) break;
    await new Promise<void>((r) => (wake = r));
    wake = null;
  }
  if (failure && seen.size === 0) throw failure;
}
