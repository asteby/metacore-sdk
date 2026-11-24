/**
 * `ai.complete` for addon frontends: LLM completions run by the HOST (no LLM
 * keys in the addon), billed to the organization's Pulse Sparks (the AI
 * wallet, 1 Spark = USD 0.01). Contract: metacore-kernel
 * `docs/capabilities-ai.md` (RFC 0007).
 *
 * The addon declares each feature in its manifest
 * (`{"kind":"ai:complete","target":"ticket_triage","reason":"…"}`, optional
 * `ai` block with caps) and calls:
 *
 *   const ai = createAIClient(api, "tickets");
 *   const res = await ai.complete({ feature: "ticket_triage", prompt: text, tier: "fast" });
 *   if (res.status === "ok") use(res.content);
 *   else showNoAI(res.status, res.message); // insufficient_pulse, quota_exceeded… are results, not errors
 *
 * Only caller bugs throw ({@link AICompleteError}: `forbidden`,
 * `invalid_input`). No Pulse, a reached cap, a rate limit or the hub being down
 * resolve to a result with that `status`, so a screen never breaks for AI.
 */
import { HostApiError, type HostApi } from "./host.js";

/** Cost/quality intent, cheapest first. The hub picks the model. */
export const AI_TIERS = ["fast", "balanced", "heavy"] as const;
export type AITier = (typeof AI_TIERS)[number];

/** Every `ai.complete` outcome; all but `ok` are normal results. */
export const AI_STATUSES = [
  "ok",
  "insufficient_pulse",
  "quota_exceeded",
  "budget_exceeded",
  "rate_limited",
  "disabled",
  "no_wallet",
  "unavailable",
  "invalid_output",
] as const;
export type AIStatus = (typeof AI_STATUSES)[number];

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; schema: Record<string, unknown>; name?: string };

/** `ai.complete` input. Send `messages` or `prompt`. */
export interface AIRequest {
  /** Feature granted by an `ai:complete` capability of the addon's manifest. */
  feature: string;
  messages?: AIMessage[];
  prompt?: string;
  system?: string;
  tier?: AITier;
  response_format?: AIResponseFormat;
  max_tokens?: number;
  temperature?: number;
  /**
   * Same key → same result, charged once. {@link createAIClient} generates
   * one per call when absent; pass your own to dedupe across reloads
   * (`ticket:${id}:triage:v1`).
   */
  idempotency_key?: string;
}

export interface AIUsage {
  input_tokens: number;
  output_tokens: number;
}

/** `ai.complete` output. `T` types `json` for a JSON response_format. */
export interface AIResult<T = unknown> {
  status: AIStatus;
  content?: string;
  json?: T;
  usage: AIUsage;
  cost_sparks: number;
  model?: string;
  request_id?: string;
  message?: string;
  retry_after_seconds?: number;
  billed_to?: "org" | "sponsor";
  replay?: boolean;
}

/** What GET /ai/usage answers for one addon (this month, against its caps). */
export interface AIAddonUsage {
  addon: string;
  period: string;
  spent_sparks: number;
  monthly_sparks_cap: number;
  features: Array<{
    key: string;
    purpose?: string;
    spent_sparks: number;
    monthly_sparks_cap: number;
    max_tier?: AITier;
    personal_data?: boolean;
  }>;
}

/** A caller bug: the manifest does not grant the feature, or the request breaks the contract. */
export class AICompleteError extends Error {
  readonly code: "forbidden" | "invalid_input";
  readonly status: number;
  constructor(code: "forbidden" | "invalid_input", message: string, status: number) {
    super(message);
    this.name = "AICompleteError";
    this.code = code;
    this.status = status;
  }
}

/** True for every status except `ok`. */
export function isAIDegraded(res: Pick<AIResult, "status">): boolean {
  return res.status !== "ok";
}

/** A result without an answer (what the client returns when the host is unreachable). */
export function aiUnavailable(message: string): AIResult<never> {
  return { status: "unavailable", message, usage: { input_tokens: 0, output_tokens: 0 }, cost_sparks: 0 };
}

export interface AIClientOptions {
  /** Host endpoint of ai.complete. Default `/ai/complete`. */
  completePath?: string;
  /** Host endpoint of the usage report. Default `/ai/usage`. */
  usagePath?: string;
  /** Idempotency key generator (default `crypto.randomUUID`). */
  newKey?: () => string;
}

export interface AIClient {
  complete<T = unknown>(req: AIRequest, opts?: { signal?: AbortSignal }): Promise<AIResult<T>>;
  usage(): Promise<AIAddonUsage>;
}

function defaultKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Bind `ai.complete` to one addon. `addon` is the manifest key of the calling
 * addon; the host only accepts it when the addon is installed and enabled in
 * the organization and declares the feature.
 */
export function createAIClient(api: HostApi, addon: string, options: AIClientOptions = {}): AIClient {
  const completePath = options.completePath ?? "/ai/complete";
  const usagePath = options.usagePath ?? "/ai/usage";
  const newKey = options.newKey ?? defaultKey;
  if (!addon) throw new Error("createAIClient: addon key is required");
  return Object.freeze({
    async complete<T = unknown>(req: AIRequest, opts?: { signal?: AbortSignal }): Promise<AIResult<T>> {
      const body = { addon, ...req, idempotency_key: req.idempotency_key || newKey() };
      try {
        return await api.post<AIResult<T>>(completePath, body, opts?.signal ? { signal: opts.signal } : undefined);
      } catch (e) {
        if (e instanceof HostApiError && (e.code === "forbidden" || e.code === "invalid_input")) {
          throw new AICompleteError(e.code, e.message, e.status);
        }
        if (opts?.signal?.aborted) throw e;
        // Host or network failure: a result, never a broken screen.
        return aiUnavailable(e instanceof Error ? e.message : "ai.complete is not available");
      }
    },
    usage(): Promise<AIAddonUsage> {
      return api
        .get<{ success?: boolean; data: AIAddonUsage }>(usagePath, { params: { addon } })
        .then((r) => r.data);
    },
  });
}
