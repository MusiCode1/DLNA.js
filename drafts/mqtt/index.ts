import 'dotenv/config';

import * as mqtt from "mqtt";
import { MqttRouter } from "mqtt-router";
import type { MqttContext } from "mqtt-router";



(async () => {

    const host = process.env.MQTT_HOST || '',
        username = process.env.MQTT_USERNAME || '',
        password = process.env.MQTT_PASSWORD || '';


    const client = mqtt.connect(`mqtt://${host}`, {
        username,
        password,
        //protocolVersion: 5,

        /*         log: (...args: any[]) => {
                    console.log("[MQTT LOG]:", ...args);
                } */
    });



    client.on("connect", () => {
        console.log("Connected to MQTT broker");
        /*         client.subscribe("stat/#");
                client.subscribe("tele/#");
                client.subscribe("tasmota/discovery/#"); */
    });

    await setupRouter({ client });


    client.on("error", (error) => {
        console.error("MQTT Client Error:", error);
    });

    client.on('close', () => {
        console.log("MQTT connection closed");
    });

    function powerOn() {
        client.publish("cmnd/tasmota_61E03C/Power1", "1");
    }


})().catch((error) => {
    console.error("Error in MQTT client:", error);
});


async function setupRouter({ client }: { client: mqtt.MqttClient }) {

    const router = new MqttRouter(client);

    type DeviceState = {
        online: boolean;
        sensors: Record<string, string>;
        relays: Record<string, string>;
        properties: Record<string, unknown>;
        lastUpdate?: string;
        isTarget?: boolean;
    };

    const onlineDevices: Map<string, DeviceState> = new Map();
    const aliasToCanonical: Map<string, string> = new Map();
    const REQUIRED_SENSORS = ["Switch1", "Switch2"];

    const resolveDeviceId = (deviceId: string, payload?: unknown): string => {
        // אם כבר יש מיפוי, נחזיר את הקנוני
        const mapped = aliasToCanonical.get(deviceId);
        if (mapped) return mapped;

        let canonical = deviceId;

        if (payload && typeof payload === "object") {
            const tField = (payload as any).t;
            const macField = (payload as any).mac ?? (payload as any).MAC;

            if (typeof tField === "string" && tField.trim()) {
                canonical = tField.trim();
            }

            if (typeof macField === "string" && macField.trim()) {
                const normalizedMac = macField.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                if (normalizedMac) {
                    // אם אין tField, נעדיף MAC; אם יש tField, MAC הופך לכינוי
                    if (canonical === deviceId) {
                        canonical = normalizedMac;
                    } else {
                        aliasToCanonical.set(normalizedMac, canonical);
                    }
                }
            }
        }

        if (canonical !== deviceId) {
            aliasToCanonical.set(deviceId, canonical);
        }

        return canonical;
    };

    const ensureDevice = (deviceId: string): DeviceState => {
        const existing = onlineDevices.get(deviceId);
        if (existing) return existing;
        const created: DeviceState = {
            online: false,
            sensors: {},
            relays: {},
            properties: {},
            isTarget: false,
        };
        onlineDevices.set(deviceId, created);
        return created;
    };

    const updateTargetFlag = (device: DeviceState) => {
        const sensorKeys = new Set(Object.keys(device.sensors).map((k) => k.toUpperCase()));
        const relayKeys = new Set(Object.keys(device.relays).map((k) => k.toUpperCase()));

        const hasSensors = REQUIRED_SENSORS.every((s) => sensorKeys.has(s.toUpperCase()));
        const hasRelay = Array.from(relayKeys).some((k) => k === "POWER1" || k.startsWith("POWER"));

        device.isTarget = hasSensors && hasRelay;
    };

    const markOnline = (deviceId: string, payload?: unknown) => {
        const canonicalId = resolveDeviceId(deviceId, payload);
        const device = ensureDevice(canonicalId);
        device.online = true;
        device.lastUpdate = new Date().toISOString();
        updateTargetFlag(device);
        onlineDevices.set(canonicalId, device);
        console.log(`Device ${canonicalId} is online. Total tracked: ${onlineDevices.size}`);
    };

    const markOffline = (deviceId: string, payload?: unknown) => {
        const canonicalId = resolveDeviceId(deviceId, payload);
        const device = ensureDevice(canonicalId);
        device.online = false;
        device.lastUpdate = new Date().toISOString();
        updateTargetFlag(device);
        onlineDevices.set(canonicalId, device);
        console.log(`Device ${canonicalId} is offline. Total tracked: ${onlineDevices.size}`);
    };

    const updateFromJson = (deviceId: string, payload: unknown) => {
        if (payload === null || typeof payload !== "object") return;
        const canonicalId = resolveDeviceId(deviceId, payload);
        const device = ensureDevice(canonicalId);

        const entries = Object.entries(payload as Record<string, unknown>);

        for (const [key, value] of entries) {
            const upper = key.toUpperCase();
            if (upper.startsWith("SWITCH")) {
                device.sensors[key] = String(value);
            } else if (upper.startsWith("POWER")) {
                device.relays[key] = String(value);
            } else {
                device.properties[key] = value;
            }
        }

        // ננסה לחלץ גם מתתי-מבנים מוכרים (כמו sn/swn/rl)
        const maybeSn = (payload as any).sn;
        if (maybeSn && typeof maybeSn === "object") {
            const snEntries = Object.entries(maybeSn as Record<string, unknown>);
            for (const [key, value] of snEntries) {
                const upper = key.toUpperCase();
                if (upper.startsWith("SWITCH")) {
                    device.sensors[key] = String(value);
                } else if (upper.startsWith("POWER")) {
                    device.relays[key] = String(value);
                }
            }
        }

        const swn = (payload as any).swn;
        if (Array.isArray(swn)) {
            swn.forEach((name, idx) => {
                if (typeof name === "string" && name.trim()) {
                    const key = name.trim();
                    // מחפשים ערך תואם במערך swc/rl באינדקס זהה
                    const swc = (payload as any).swc;
                    const rl = (payload as any).rl;
                    const maybeSwitchVal = Array.isArray(swc) ? swc[idx] : undefined;
                    const maybeRelayVal = Array.isArray(rl) ? rl[idx] : undefined;
                    if (maybeSwitchVal !== undefined) {
                        device.sensors[key] = String(maybeSwitchVal);
                    }
                    if (maybeRelayVal !== undefined) {
                        device.relays[`Power${idx + 1}`] = String(maybeRelayVal);
                    }
                }
            });
        }

        if (entries.length > 0) {
            device.lastUpdate = new Date().toISOString();
            updateTargetFlag(device);
            onlineDevices.set(canonicalId, device);
            console.log(`State updated for ${deviceId}:`, {
                relays: device.relays,
                sensors: device.sensors,
                isTarget: device.isTarget,
            });
        }
    };

    await router.add('stat/:deviceId/:property', (ctx) => {
        const { params, payload, payloadType, json } = ctx;
        const type = payloadType();

        if (type === 'json') {
            const message = json() as object;

            const entries = Object.entries(message);
            const firstKey = entries?.[0]?.[0] || '';
            const firstValue = entries?.[0]?.[1] || '';

            if (params.property === 'RESULT' && firstKey &&
                firstKey.startsWith('Switch') && firstValue?.Action === 'ON') {
                onButtonPress(message, ctx)
            }

            updateFromJson(params.deviceId, message);
            //console.log(`stat JSON from ${params.deviceId}/${params.property}:`, message);
        } else {
            //console.log(`stat ${type} from ${params.deviceId}/${params.property}:`, payload.toString());
        }
    });

    await router.add('tele/:deviceId/:property', ({ params, payload, payloadType, json }) => {
        const type = payloadType();

        if (params.property === 'LWT') {
            const status = type === 'json' ? json() : payload.toString();
            if (status === 'Online') {
                markOnline(params.deviceId);
            } else if (status === 'Offline') {
                markOffline(params.deviceId);
            }
            return;
        }

        if (type === 'json') {
            const message = json();
            updateFromJson(params.deviceId, message);
            //console.log(`tele JSON from ${params.deviceId}/${params.property}:`, message);
        } else {
            //console.log(`tele ${type} from ${params.deviceId}/${params.property}:`, payload.toString());
        }
    });

    await router.add('tasmota/discovery/:deviceId/:property', ({ params, payload, payloadType, json }) => {
        const type = payloadType();

        if (params.property === 'LWT') {
            const status = type === 'json' ? json() : payload.toString();
            if (status === 'Online') {
                markOnline(params.deviceId);
            } else if (status === 'Offline') {
                markOffline(params.deviceId);
            }
            return;
        }

        if (type === 'json') {
            const message = json();
            updateFromJson(params.deviceId, message);
            //console.log(`discovery JSON for ${params.deviceId}/${params.property}:`, message);
        } else {
            //console.log(`discovery ${type} for ${params.deviceId}/${params.property}:`, payload.toString());
        }
    });

    (globalThis as any).mqttClient = client;
    (globalThis as any).onlineDevices = onlineDevices;


    async function onButtonPress(message: any, ctx: MqttContext) {
        console.log("Button press detected:", message);

        const ButtonsNamesList: Record<string, string> = {
            'Switch1': 'OnButton',
            'Switch2': 'OffButton',
        };

        const entries = Object.entries(message);
        const buttonID = entries?.[0]?.[0] || '';
        const buttonName = ButtonsNamesList[buttonID] || 'UnknownButton';
        const deviceId = ctx.params.deviceId;

        console.log(`Button pressed: ${buttonName} (${buttonID}) ${deviceId}`);

        // כאן אפשר להוסיף לוגיקה נוספת לטיפול בלחיצת הכפתור

        const topic = `cmnd/${deviceId}/Power1`;
        // const action = buttonName === 'OnButton' ? "1" : "0";

        if (buttonName === 'OnButton') {
            // לדוגמה, הבהוב LED לפני הפעלת המכשיר
            await blinkLED(client, topic, 5, 500);
            client.publish(topic, '1');
        } else {

            client.publish(topic, '0');
        }

        // console.log(`Published to ${topic} with action ${action}`);

    }
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blinkLED(client: mqtt.MqttClient, topic: string, times: number, intervalMs: number) {
    for (let i = 0; i < times; i++) {

        client.publish(topic, "1");
        await delay(intervalMs);
        client.publish(topic, "0");
        await delay(intervalMs);
    }
}

