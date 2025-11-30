import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import type { MqttClient, Packet } from "mqtt";
import { MqttRouter } from "../src/MqttRouter.js";

class FakeMqttClient extends EventEmitter {
  public subscribeCalls: Array<{ topic: string; qos: number }> = [];
  public unsubscribeCalls: Array<string | string[]> = [];

  subscribe(
    topic: string,
    opts: { qos?: number },
    cb?: (err: Error | null, granted?: Array<{ topic: string; qos: number }>) => void
  ): this {
    this.subscribeCalls.push({ topic, qos: opts.qos ?? 0 });
    cb?.(null, [{ topic, qos: opts.qos ?? 0 }]);
    return this;
  }

  unsubscribe(topic: string | string[], cb?: (err?: Error | null) => void): this {
    this.unsubscribeCalls.push(topic);
    cb?.(null);
    return this;
  }

  emitMessage(topic: string, payload: Buffer, packet: Packet = {} as Packet) {
    this.emit("message", topic, payload, packet);
  }
}

function createRouter() {
  const fake = new FakeMqttClient();
  const client = fake as unknown as MqttClient;
  const router = new MqttRouter(client);
  return { fake, router };
}

describe("MqttRouter", () => {
  it("גוזר subscription, מוסיף handler ומפענח JSON", async () => {
    const { fake, router } = createRouter();
    const handler = vi.fn();

    await router.add("stat/:deviceId/:property", handler);

    expect(fake.subscribeCalls).toEqual([{ topic: "stat/+/+", qos: 0 }]);

    fake.emitMessage("stat/deviceA/POWER", Buffer.from('{"on":true}'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0][0];
    expect(ctx.params).toEqual({ deviceId: "deviceA", property: "POWER" });
    expect(ctx.payloadType()).toBe("json");
    expect(ctx.json()).toEqual({ on: true });
    expect(ctx.asString()).toBe('{"on":true}');
  });

  it("מבצע unsubscribe רק כשאין עוד handlers", async () => {
    const { fake, router } = createRouter();
    const h1 = vi.fn();
    const h2 = vi.fn();

    await router.add("tele/:deviceId/SENSOR", h1, { qos: 1 });
    await router.add("tele/:deviceId/SENSOR", h2, { qos: 1 });

    expect(fake.subscribeCalls).toEqual([{ topic: "tele/+/SENSOR", qos: 1 }]);

    const res1 = await router.remove("tele/:deviceId/SENSOR", h1);
    expect(res1.unsubscribed).toEqual([]);

    const res2 = await router.remove("tele/:deviceId/SENSOR", h2);
    expect(res2.unsubscribed).toEqual(["tele/+/SENSOR"]);
    expect(fake.unsubscribeCalls).toEqual(["tele/+/SENSOR"]);
  });

  it("מזהה binary payload", async () => {
    const { fake, router } = createRouter();
    const handler = vi.fn();
    await router.add("bin/:id", handler, { subscription: "bin/+" });

    const binary = Buffer.from([0, 159, 146, 150]);
    fake.emitMessage("bin/42", binary);
    await new Promise((resolve) => setImmediate(resolve));

    const ctx = handler.mock.calls[0][0];
    expect(ctx.payloadType()).toBe("binary");
  });

  it("destroy עושה unsubscribe לכל המנויים", async () => {
    const { fake, router } = createRouter();
    await router.add("a/:x", vi.fn());
    await router.add("b/:y", vi.fn());

    await router.destroy();

    expect(fake.unsubscribeCalls).toEqual([["a/+","b/+"]]);
    expect(router.destroyed).toBe(true);
  });
});
