

You are an advanced AI coding assistant specialized in Node.js, TypeScript, MQTT, and routing abstractions similar to Express.

Your task:
I want you to design and implement a small but robust TypeScript library that provides an Express-style router on top of the `mqtt` client library, using `path-to-regexp` for route matching.

The router should allow me to write patterns like:

  "stat/:deviceId/:property"
  "tele/:deviceId/SENSOR"
  "cmnd/:deviceId/:command"

and internally handle MQTT subscriptions and topic matching in a safe, type-friendly way.

---

### High-level requirements

1. **Language & environment**

- Use **TypeScript** (strict mode compatible).
- Target Node.js (CommonJS or ESM is fine, but the code must compile cleanly with `moduleResolution: node`).
- Use the official `mqtt` package and `path-to-regexp`:

```ts
  import {
    MqttClient,
    Packet,
    IClientSubscribeOptions,
    ISubscriptionGrant,
  } from "mqtt";

  import { match, MatchFunction } from "path-to-regexp";
```

2. **Goal**

Build a class `MqttRouter` that wraps an existing `MqttClient` and lets me register routes using Express-style path patterns with named params (e.g. `:deviceId`, `:property`), while automatically:

* Managing MQTT subscriptions (with reference counting).
* Matching incoming topics against patterns using `path-to-regexp`.
* Extracting `params` from the topic and passing them to the handler.
* Providing a small context object (`ctx`) to each handler, with helpers.

---

### API design

#### Types

Define at least the following types:

```ts
export interface MqttContext<P = unknown> {
  client: MqttClient;
  topic: string;
  payload: Buffer;
  packet: Packet;
  params: Record<string, string>;
  json(): P;  // helper to parse payload as JSON
}

export type MqttHandler<P = unknown> = (
  ctx: MqttContext<P>
) => void | Promise<void>;

export interface RouteOptions {
  /**
   * Optional explicit MQTT subscription filter.
   * If omitted, it will be derived automatically from the pattern.
   * Example:
   *   pattern:      "stat/:deviceId/:property"
   *   subscription: "stat/+/+"
   */
  subscription?: string;
  qos?: 0 | 1 | 2;
}

export interface RouterOptions {
  defaultQos?: 0 | 1 | 2;
  /**
   * When true (default), the router automatically manages
   * subscribe / unsubscribe on the underlying MQTT client.
   * When false, the user will manage subscriptions manually.
   */
  handleSubscriptions?: boolean;

  /**
   * Optional global error handler for route handlers.
   * If provided, any errors thrown by handlers should be passed here.
   */
  onError?: (err: unknown, ctx: MqttContext<any>) => void;
}

export interface AddRouteResult {
  pattern: string;
  subscription: string;
  granted: ReadonlyArray<ISubscriptionGrant>;
}

export interface RemoveRouteResult {
  pattern: string;
  /**
   * List of MQTT subscription filters that were actually unsubscribed.
   * If reference counts did not drop to zero, this can be empty.
   */
  unsubscribed: ReadonlyArray<string>;
}
```

You can introduce additional internal types like `InternalRoute` if useful.

#### Class: `MqttRouter`

Implement:

```ts
export class MqttRouter {
  constructor(client: MqttClient, options?: RouterOptions);

  add<P = unknown>(
    pattern: string,
    handler: MqttHandler<P>,
    options?: RouteOptions
  ): Promise<AddRouteResult>;

  remove(
    pattern: string,
    handler?: MqttHandler<any>
  ): Promise<RemoveRouteResult>;

  destroy(): Promise<void>;

  // Optional helpers / accessors:
  readonly destroyed: boolean;
  readonly routes: ReadonlyArray<{
    pattern: string;
    subscription: string;
    qos: 0 | 1 | 2;
  }>;
}
```

##### `constructor`

* Store the `client` and normalized `options` (defaultQos, handleSubscriptions, onError).
* Attach a single `"message"` listener to the MQTT client, e.g.:

  ```ts
  this.client.on("message", this.onMessageBound);
  ```

##### `add`

Behavior:

* Accept patterns like `"stat/:deviceId/:property"` **with or without** a leading slash.

  * Internally **normalize** to always have a leading slash, e.g. `/stat/:deviceId/:property`.

* Create a `MatchFunction` using `path-to-regexp`:

  ```ts
  const normalizedPattern = pattern.startsWith("/")
    ? pattern
    : "/" + pattern;

  const matcher = match(normalizedPattern);
  ```

* Derive the MQTT subscription filter if `options.subscription` is not provided:

  * Strip leading slash.
  * Split on `/`.
  * For each segment:

    * If it starts with `:` (e.g. `:deviceId`), convert to `+`.
    * If it is `#` or `+`, leave as is.
    * Otherwise, keep the literal string.

  Example:

  * pattern: `/stat/:deviceId/:property` → subscription: `stat/+/+`
  * pattern: `tele/:deviceId/#` → subscription: `tele/+/#`

* Use a QoS of `options.qos ?? defaultQos`.

* Maintain an internal list of routes:

  ```ts
  interface InternalRoute {
    pattern: string;
    matcher: MatchFunction<object>;
    handler: MqttHandler<any>;
    subscription: string;
    qos: 0 | 1 | 2;
  }
  ```

* If `handleSubscriptions` is true:

  * Maintain a reference count per subscription filter (`Map<string, number>`).
  * When adding a route whose subscription filter refcount goes from 0 → 1:

    * Call `client.subscribe(subscription, { qos }, callback)`.
    * Wrap this in a Promise and handle the fact that `granted` can be `undefined` in the callback:

      ```ts
      await new Promise<ISubscriptionGrant[]>((resolve, reject) => {
        const opts: IClientSubscribeOptions = { qos };
        this.client.subscribe(subscription, opts, (err, granted) => {
          if (err) {
            reject(err);
          } else {
            resolve(granted ?? []);
          }
        });
      });
      ```

* Return `AddRouteResult` with the normalized `pattern`, the subscription filter, and granted (or `[]`).

##### `remove`

Behavior:

* Normalize the pattern like in `add`.
* If `handler` is provided: remove only the routes with that pattern + handler.
* If no `handler` is provided: remove all routes matching that pattern.
* If `handleSubscriptions` is true:

  * For each affected route, decrement the reference count for `subscription`.
  * If a subscription’s refcount reaches 0:

    * Call `client.unsubscribe(subscription, callback)` wrapped in a Promise.
* Return `RemoveRouteResult` with `pattern` and an array of filters that were actually unsubscribed (could be empty).

##### `destroy`

Behavior:

* Mark the router as destroyed.
* Remove the `"message"` listener from the MQTT client.
* If `handleSubscriptions` is true:

  * Unsubscribe from all currently referenced subscription filters.
* Clear all route definitions and internal maps.
* After `destroy()` is called, any call to `add` or `remove` should throw a clear error like `"MqttRouter is destroyed"`.

---

### Message handling

Implement a private `onMessage` method, bound in the constructor:

```ts
private onMessage(topic: string, payload: Buffer, packet: Packet): void {
  if (this.destroyed) return;

  const path = "/" + topic;
  for (const route of this.routes) {
    const res = route.matcher(path);
    if (!res) continue;

    const ctx: MqttContext<any> = {
      client: this.client,
      topic,
      payload,
      packet,
      params: res.params as Record<string, string>,
      json() {
        return JSON.parse(payload.toString("utf8"));
      },
    };

    // Run handler; catch async errors.
    Promise.resolve(route.handler(ctx)).catch((err) => {
      if (this.opts.onError) {
        this.opts.onError(err, ctx);
      } else {
        // At minimum, log the error:
        console.error("MQTT route handler error:", err);
      }
    });
  }
}
```

Make sure:

* **No unhandled promise rejections**.
* Matching uses `path-to-regexp` strictly.
* `params` are always strings (cast as needed).

---

### Type-safety and ergonomics

* Avoid `any` where possible.
* Use generic parameter `P` on `MqttHandler<P>` and `MqttContext<P>` so users can specify the JSON payload type when calling `router.add`.
* The code must compile error-free in strict TypeScript.
* No need for eslint/tslint config; just write clean, idiomatic code.

---

### Example usage

At the bottom of the file (or in a separate small example block), include a short example showing:

```ts
import mqtt from "mqtt";
import { MqttRouter } from "./MqttRouter";

const client = mqtt.connect("mqtt://localhost:1883");

const router = new MqttRouter(client, {
  defaultQos: 0,
  handleSubscriptions: true,
  onError: (err, ctx) => {
    console.error("Error in route handler", err, "for topic", ctx.topic);
  },
});

// Example route: stat/deviceId/property
router.add("stat/:deviceId/:property", async ({ params, payload }) => {
  const { deviceId, property } = params;
  console.log("Device:", deviceId, "property:", property, "=", payload.toString());
});

// Example route: tele/deviceId/SENSOR (JSON)
router.add<{ temperature: number; humidity: number }>(
  "tele/:deviceId/SENSOR",
  ({ params, json }) => {
    const { deviceId } = params;
    const data = json();
    console.log("Sensor update from", deviceId, data.temperature, data.humidity);
  }
);
```

---

### What you should output

1. A complete, self-contained **TypeScript implementation** of the router in a single file (for example `MqttRouter.ts`).
2. Include all interfaces and types in the same file.
3. Ensure the code uses the APIs of `mqtt` and `path-to-regexp` correctly.
4. Make it ready to drop into a real project with `"strict": true` in `tsconfig.json`.

If there is any ambiguity in my description, make reasonable choices and document them briefly as comments in the code.

Now, here is my current code (if any). Please refactor or rewrite it according to the requirements above:

<<CURRENT_CODE>>
