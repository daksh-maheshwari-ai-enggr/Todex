import "./env";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";

/* ============================================================
   Fallback chat model
   ============================================================ */

/** Pull plain text out of a string or content-block array. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) =>
        typeof part === "string" ? part : part?.text ?? ""
      )
      .join("");
  }
  return "";
}

interface FallbackOptions {
  providers: BaseChatModel[];
  names: string[];
  onFallback?: (failed: string, next: string, error: unknown) => void;
}

/**
 * A BaseChatModel that wraps an ordered list of provider models and transparently
 * falls through to the next one when a provider errors (rate limit / quota /
 * 5xx / network).
 *
 * Why not `model.withFallbacks([...])`? That helper returns a
 * `RunnableWithFallbacks` which has no `bindTools` method, so `createAgent`
 * rejects it. Extending `BaseChatModel` keeps `bindTools` and streaming intact,
 * so tool calling and live token output still work.
 */
export class FallbackChatModel extends BaseChatModel {
  private providers: BaseChatModel[];
  private names: string[];
  private onFallback?: (failed: string, next: string, error: unknown) => void;
  private toolList: any[] = [];
  private toolKwargs: any = undefined;

  /** Name of the provider that most recently served a response. */
  activeProvider?: string;

  constructor(fields: FallbackOptions) {
    super({});
    this.providers = fields.providers;
    this.names = fields.names;
    this.onFallback = fields.onFallback;
  }

  _llmType(): string {
    return "fallback-chat-model";
  }

  bindTools(tools: any[], kwargs?: any): any {
    const next = new FallbackChatModel({
      providers: this.providers,
      names: this.names,
      onFallback: this.onFallback,
    });
    next.toolList = tools;
    next.toolKwargs = kwargs;
    return next;
  }

  /** Bind tools to a single provider, if this model was created via bindTools. */
  private boundFor(provider: BaseChatModel): any {
    if (!this.toolList.length) return provider;
    return provider.bindTools?.(this.toolList, this.toolKwargs) ?? provider;
  }

  /** Minimal call options to forward — avoids re-running callbacks/tracing. */
  private callOptions(options: any): any {
    return options?.signal ? { signal: options.signal } : {};
  }

  private reportFallback(index: number, error: unknown) {
    const failed = this.names[index] ?? `provider#${index}`;
    const next = this.names[index + 1];
    if (!next) return;
    this.onFallback?.(failed, next, error);
  }

  async _generate(
    messages: BaseMessage[],
    options: any,
    _runManager?: any
  ): Promise<ChatResult> {
    let lastError: unknown;

    for (let i = 0; i < this.providers.length; i++) {
      try {
        const model = this.boundFor(this.providers[i]);
        const result = (await model.invoke(
          messages,
          this.callOptions(options)
        )) as AIMessage;

        this.activeProvider = this.names[i];
        return {
          generations: [
            { text: extractText(result.content), message: result },
          ],
        };
      } catch (err) {
        lastError = err;
        this.reportFallback(i, err);
      }
    }

    throw lastError;
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: any,
    _runManager?: any
  ): AsyncGenerator<ChatGenerationChunk> {
    let lastError: unknown;

    for (let i = 0; i < this.providers.length; i++) {
      let yieldedAny = false;

      try {
        const model = this.boundFor(this.providers[i]);
        const stream = await model.stream(messages, this.callOptions(options));

        for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
          this.activeProvider = this.names[i];
          yieldedAny = true;
          yield new ChatGenerationChunk({
            text: chunk.text ?? "",
            message: chunk,
          });
        }

        return;
      } catch (err) {
        lastError = err;
        // Once tokens have been emitted we cannot safely switch providers.
        if (yieldedAny) throw err;
        this.reportFallback(i, err);
      }
    }

    throw lastError;
  }
}

/* ============================================================
   Provider registry
   ============================================================ */

export interface ProviderInfo {
  name: string;
  label: string;
  model: string;
  baseURL: string;
}

interface ProviderSpec {
  name: string;
  label: string;
  apiKeyEnv: string;
  modelEnv: string;
  baseUrlEnv?: string;
  defaultBaseURL: string;
  defaultModel: string;
  headers?: Record<string, string>;
}

/**
 * Provider presets, tried in order. Every provider speaks the OpenAI protocol,
 * so each one is just a ChatOpenAI with a different base URL / key / model.
 *
 * FreeLLMAPI is the only active provider for now. To add another provider later,
 * append a ProviderSpec here and add its key to `PROVIDER_KEY_ENV` in
 * `src/config.ts` — the fallback chain and factory below pick it up unchanged.
 * The first-run UX intentionally exposes no provider/model selection yet.
 */
const PROVIDERS: ProviderSpec[] = [
  {
    name: "freellmapi",
    label: "FreeLLMAPI",
    apiKeyEnv: "FREELLMAPI_API_KEY",
    modelEnv: "FREELLMAPI_MODEL",
    baseUrlEnv: "FREELLMAPI_BASE_URL",
    defaultBaseURL: "http://localhost:3001/v1",
    defaultModel: "auto", // let the router pick; or "auto:fast"/"auto:smart"
  },
];

/** Names of every configured provider, in fallback order. */
export function resolveProviderChain(): ProviderInfo[] {
  const configured: ProviderInfo[] = [];

  for (const spec of PROVIDERS) {
    const apiKey = process.env[spec.apiKeyEnv];
    if (!apiKey) continue;

    configured.push({
      name: spec.name,
      label: spec.label,
      model: process.env[spec.modelEnv] || spec.defaultModel,
      baseURL:
        (spec.baseUrlEnv && process.env[spec.baseUrlEnv]) || spec.defaultBaseURL,
    });
  }

  return configured;
}

function buildProviderModel(info: ProviderInfo): BaseChatModel {
  const spec = PROVIDERS.find((p) => p.name === info.name)!;
  const apiKey = process.env[spec.apiKeyEnv]!;

  return new ChatOpenAI({
    model: info.model,
    apiKey,
    temperature: 0,
    configuration: {
      baseURL: info.baseURL,
      ...(spec.headers ? { defaultHeaders: spec.headers } : {}),
    },
  });
}

/** Human-readable description of the active fallback chain (for the CLI). */
export function describeModelChain(): string {
  const chain = resolveProviderChain();
  if (!chain.length) return "No providers configured.";
  return chain
    .map((p, i) => `${i + 1}. ${p.label} — ${p.model}`)
    .join("\n");
}

/* ============================================================
   Public factory
   ============================================================ */

/**
 * Build the chat model used by the agent.
 *
 * Only FreeLLMAPI is active today. Providers are tried in order and, when more
 * than one is configured, a rate limit / quota / 5xx on one transparently falls
 * through to the next. Only providers whose API key env var is set are included;
 * the key is resolved globally by `src/config.ts` (or overridden via the env).
 */
export function createModel(): BaseChatModel {
  const chain = resolveProviderChain();

  if (!chain.length) {
    throw new Error(
      "No model provider configured. Run todex to enter your FreeLLMAPI API " +
        "key, or set FREELLMAPI_API_KEY in the environment."
    );
  }

  const models = chain.map(buildProviderModel);
  const names = chain.map((p) => p.label);

  // Single provider → use it directly, no wrapper overhead.
  if (models.length === 1) return models[0];

  return new FallbackChatModel({
    providers: models,
    names,
    onFallback: (failed, next, error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `\n⚠️  ${failed} failed (${msg.slice(0, 120)}); falling back to ${next}\n`
      );
    },
  });
}
