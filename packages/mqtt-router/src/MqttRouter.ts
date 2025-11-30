import type {
  IClientSubscribeOptions,
  ISubscriptionGrant,
  MqttClient,
  Packet
} from "mqtt";
import { match, type MatchFunction } from "path-to-regexp";
import { TextDecoder } from "util";

export interface MqttContext<P = unknown> {
  client: MqttClient;
  topic: string;
  payload: Buffer;
  packet: Packet;
  params: Record<string, string>;
  /**
   * Parse המטע"ד כ-JSON ומחזיר P. זורק אם לא JSON תקין.
   */
  json(): P;
  /**
   * מחזיר את המטען כמחרוזת UTF-8 (גם אם אינו JSON).
   */
  asString(): string;
  /**
   * זיהוי סוג מטען בסיסי.
   */
  payloadType(): "json" | "text" | "binary";
}

export type MqttHandler<P = unknown> = (
  ctx: MqttContext<P>
) => void | Promise<void>;

export interface RouteOptions {
  subscription?: string;
  qos?: 0 | 1 | 2;
}

export interface RouterOptions {
  defaultQos?: 0 | 1 | 2;
  handleSubscriptions?: boolean;
  onError?: (err: unknown, ctx: MqttContext<any>) => void;
}

export interface AddRouteResult {
  pattern: string;
  subscription: string;
  granted: ReadonlyArray<ISubscriptionGrant>;
}

export interface RemoveRouteResult {
  pattern: string;
  unsubscribed: ReadonlyArray<string>;
}

interface InternalRoute {
  pattern: string;
  matcher: MatchFunction<object>;
  handler: MqttHandler<any>;
  subscription: string;
  qos: 0 | 1 | 2;
}

interface NormalizedOptions {
  defaultQos: 0 | 1 | 2;
  handleSubscriptions: boolean;
  onError?: (err: unknown, ctx: MqttContext<any>) => void;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function normalizePattern(pattern: string): string {
  return pattern.startsWith("/") ? pattern : `/${pattern}`;
}

function patternToMqttFilter(pattern: string): string {
  const noSlash = pattern.replace(/^\//, "");
  const segments = noSlash.split("/");

  return segments
    .map((segment) => {
      if (!segment) return segment;
      if (segment.startsWith(":")) return "+";
      return segment;
    })
    .join("/");
}

function tryDecodeUtf8(payload: Buffer): { ok: true; text: string } | { ok: false } {
  try {
    return { ok: true, text: utf8Decoder.decode(payload) };
  } catch {
    return { ok: false };
  }
}

function hasManyControlChars(text: string): boolean {
  if (text.length === 0) return false;

  let control = 0;
  let total = 0;

  for (let i = 0; i < text.length; i++) {
    total++;
    const code = text.charCodeAt(i);
    const isWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    const isControl = code < 0x20 && !isWhitespace;
    if (isControl) control++;
  }

  return control / total > 0.1;
}

function detectPayload(payload: Buffer): {
  type: "json" | "text" | "binary";
  text?: string;
  jsonValue?: unknown;
} {
  const decoded = tryDecodeUtf8(payload);
  if (!decoded.ok) {
    return { type: "binary" };
  }

  const { text } = decoded;
  if (text.includes("\ufffd") || hasManyControlChars(text)) {
    return { type: "binary" };
  }

  try {
    const parsed = JSON.parse(text);
    return { type: "json", text, jsonValue: parsed };
  } catch {
    return { type: "text", text };
  }
}

export class MqttRouter {
  private readonly client: MqttClient;
  private readonly opts: NormalizedOptions;
  private readonly subscriptionRefs = new Map<string, number>();
  private readonly routesInternal: InternalRoute[] = [];
  private readonly onMessageBound: (topic: string, payload: Buffer, packet: Packet) => void;
  private destroyedFlag = false;

  constructor(client: MqttClient, options: RouterOptions = {}) {
    this.client = client;
    this.opts = {
      defaultQos: options.defaultQos ?? 0,
      handleSubscriptions: options.handleSubscriptions ?? true,
      onError: options.onError
    };

    this.onMessageBound = this.onMessage.bind(this);
    this.client.on("message", this.onMessageBound);
  }

  get destroyed(): boolean {
    return this.destroyedFlag;
  }

  get routes(): ReadonlyArray<{ pattern: string; subscription: string; qos: 0 | 1 | 2 }> {
    return this.routesInternal.map((r) => ({
      pattern: r.pattern,
      subscription: r.subscription,
      qos: r.qos
    }));
  }

  async add<P = unknown>(
    pattern: string,
    handler: MqttHandler<P>,
    options: RouteOptions = {}
  ): Promise<AddRouteResult> {
    this.ensureNotDestroyed();

    const normalizedPattern = normalizePattern(pattern);
    const matcher = match(normalizedPattern);
    const subscription = options.subscription ?? patternToMqttFilter(normalizedPattern);
    const qos = options.qos ?? this.opts.defaultQos;

    const route: InternalRoute = {
      pattern: normalizedPattern,
      matcher,
      handler,
      subscription,
      qos
    };

    this.routesInternal.push(route);

    let granted: ISubscriptionGrant[] = [];
    if (this.opts.handleSubscriptions) {
      const prev = this.subscriptionRefs.get(subscription) ?? 0;
      this.subscriptionRefs.set(subscription, prev + 1);
      if (prev === 0) {
        granted = await this.ensureSubscribed(subscription, qos);
      }
    }

    return {
      pattern: normalizedPattern,
      subscription,
      granted
    };
  }

  async remove(pattern: string, handler?: MqttHandler<any>): Promise<RemoveRouteResult> {
    this.ensureNotDestroyed();
    const normalizedPattern = normalizePattern(pattern);

    const remaining: InternalRoute[] = [];
    const removed: InternalRoute[] = [];

    for (const route of this.routesInternal) {
      if (route.pattern !== normalizedPattern) {
        remaining.push(route);
        continue;
      }

      if (handler && route.handler !== handler) {
        remaining.push(route);
        continue;
      }

      removed.push(route);
    }

    this.routesInternal.length = 0;
    this.routesInternal.push(...remaining);

    const unsubscribed: string[] = [];

    if (this.opts.handleSubscriptions) {
      const touchedSubs = new Set<string>(removed.map((r) => r.subscription));
      for (const sub of touchedSubs) {
        const actuallyUnsubscribed = await this.maybeUnsubscribe(sub);
        if (actuallyUnsubscribed) {
          unsubscribed.push(sub);
        }
      }
    }

    return {
      pattern: normalizedPattern,
      unsubscribed
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyedFlag) return;
    this.destroyedFlag = true;

    this.client.removeListener("message", this.onMessageBound);

    if (this.opts.handleSubscriptions && this.subscriptionRefs.size > 0) {
      const subs = Array.from(this.subscriptionRefs.keys());
      await new Promise<void>((resolve, reject) => {
        this.client.unsubscribe(subs, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.routesInternal.length = 0;
    this.subscriptionRefs.clear();
  }

  private ensureNotDestroyed(): void {
    if (this.destroyedFlag) {
      throw new Error("MqttRouter is destroyed");
    }
  }

  private async ensureSubscribed(topic: string, qos: 0 | 1 | 2): Promise<ISubscriptionGrant[]> {
    return await new Promise<ISubscriptionGrant[]>((resolve, reject) => {
      const opts: IClientSubscribeOptions = { qos };
      this.client.subscribe(topic, opts, (err, granted) => {
        if (err) {
          reject(err);
        } else {
          resolve(granted ?? []);
        }
      });
    });
  }

  private async maybeUnsubscribe(topic: string): Promise<boolean> {
    const prev = this.subscriptionRefs.get(topic);
    if (prev === undefined) return false;

    if (prev > 1) {
      this.subscriptionRefs.set(topic, prev - 1);
      return false;
    }

    this.subscriptionRefs.delete(topic);

    await new Promise<void>((resolve, reject) => {
      this.client.unsubscribe(topic, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return true;
  }

  private onMessage(topic: string, payload: Buffer, packet: Packet): void {
    if (this.destroyedFlag) return;

    const path = `/${topic}`;

    for (const route of this.routesInternal) {
      const res = route.matcher(path);
      if (!res) continue;

      let cachedText: string | undefined;
      let cachedJson: unknown | undefined;
      let cachedType: "json" | "text" | "binary" | undefined;

      const ctx: MqttContext<any> = {
        client: this.client,
        topic,
        payload,
        packet,
        params: res.params as Record<string, string>,
        json: () => {
          if (cachedJson !== undefined) return cachedJson as any;
          if (cachedText === undefined) {
            cachedText = payload.toString("utf8");
          }
          cachedJson = JSON.parse(cachedText);
          cachedType = cachedType ?? "json";
          return cachedJson as any;
        },
        asString: () => {
          if (cachedText !== undefined) return cachedText;
          const decoded = tryDecodeUtf8(payload);
          if (decoded.ok) {
            cachedText = decoded.text;
            return cachedText;
          }
          // fallback: force decode to avoid throwing
          cachedText = payload.toString("utf8");
          return cachedText;
        },
        payloadType: () => {
          if (cachedType) return cachedType;
          const detected = detectPayload(payload);
          cachedType = detected.type;
          if (detected.text !== undefined) cachedText = detected.text;
          if (detected.jsonValue !== undefined) cachedJson = detected.jsonValue;
          return cachedType;
        }
      };

      Promise.resolve(route.handler(ctx)).catch((err) => {
        if (this.opts.onError) {
          this.opts.onError(err, ctx);
        } else {
          console.error("MQTT route handler error:", err);
        }
      });
    }
  }
}
