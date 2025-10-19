import type { Context } from 'hono';
import { sendWakeOnLan, checkPingWithRetries } from 'wake-on-lan';

const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const macRegex = /^([0-9a-fA-F]{2}([-:])){5}([0-9a-fA-F]{2})$/;

function isValidIPv4(address: string): boolean {
  if (!ipv4Regex.test(address)) {
    return false;
  }
  return address.split('.').every((segment) => {
    const value = Number(segment);
    return value >= 0 && value <= 255;
  });
}

function normalizeMac(mac: string): string {
  return mac.replace(/-/g, ':').toUpperCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let wakeRequestCounter = 0;

export async function handleWakeRequest(c: Context) {
    const requestId = ++wakeRequestCounter;

    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      console.error(`[wake:${requestId}] JSON parsing failed`, error);
      return c.json({
        requestId,
        status: 'error',
        message: 'גוף הבקשה אינו JSON תקין.'
      }, 400);
    }

    const {
      ipAddress,
      macAddress,
      broadcast = '255.255.255.255',
      wolPort = 9,
      waitBeforePingSeconds = 5,
      pingTotalTimeoutSeconds = 60,
      pingIntervalSeconds = 2,
      pingSingleTimeoutSeconds = 3,
      dryRun = false
    } = body ?? {};

    if (typeof ipAddress !== 'string' || !isValidIPv4(ipAddress)) {
      return c.json({
        requestId,
        status: 'error',
        message: 'כתובת ה-IP שסופקה אינה תקינה.'
      }, 400);
    }

    if (typeof macAddress !== 'string' || !macRegex.test(macAddress)) {
      return c.json({
        requestId,
        status: 'error',
        message: 'כתובת ה-MAC שסופקה אינה תקינה. השתמש בפורמט AA:BB:CC:DD:EE:FF.'
      }, 400);
    }

    if (typeof broadcast !== 'string' || !isValidIPv4(broadcast)) {
      return c.json({
        requestId,
        status: 'error',
        message: 'כתובת ה-broadcast שסופקה אינה תקינה.'
      }, 400);
    }

    if (typeof wolPort !== 'number' || wolPort <= 0 || wolPort > 65535) {
      return c.json({
        requestId,
        status: 'error',
        message: 'ערך הפורט אינו תקין.'
      }, 400);
    }

    if (typeof waitBeforePingSeconds !== 'number' || waitBeforePingSeconds < 0) {
      return c.json({
        requestId,
        status: 'error',
        message: 'ערך ההמתנה לפני בדיקת הפינג אינו תקין.'
      }, 400);
    }

    if (typeof pingTotalTimeoutSeconds !== 'number' || pingTotalTimeoutSeconds <= 0) {
      return c.json({
        requestId,
        status: 'error',
        message: 'ערך timeout הכולל לפינג חייב להיות גדול מאפס.'
      }, 400);
    }

    if (typeof pingIntervalSeconds !== 'number' || pingIntervalSeconds <= 0) {
      return c.json({
        requestId,
        status: 'error',
        message: 'ערך ההשהיה בין ניסיונות פינג חייב להיות גדול מאפס.'
      }, 400);
    }

    if (typeof pingSingleTimeoutSeconds !== 'number' || pingSingleTimeoutSeconds <= 0) {
      return c.json({
        requestId,
        status: 'error',
        message: 'ערך timeout של ניסיון פינג יחיד חייב להיות גדול מאפס.'
      }, 400);
    }

    if (typeof dryRun !== 'boolean') {
      return c.json({
        requestId,
        status: 'error',
        message: 'הפרמטר dryRun חייב להיות מסוג boolean.'
      }, 400);
    }

    const normalizedMac = normalizeMac(macAddress);
    const details = {
      requestId,
      ipAddress,
      macAddress: normalizedMac,
      broadcast,
      wolPort,
      waitBeforePingSeconds,
      pingTotalTimeoutSeconds,
      pingIntervalSeconds,
      pingSingleTimeoutSeconds,
      dryRun
    };

    console.log(`[wake:${requestId}] Starting wake sequence`, details);

    const timeoutBufferSeconds = 5;
    const operationTimeoutMs = (waitBeforePingSeconds + pingTotalTimeoutSeconds + timeoutBufferSeconds) * 1000;

    const wakeOperation = (async () => {
      if (!dryRun) {
        const wolSent = await sendWakeOnLan(normalizedMac, broadcast, wolPort);
        if (!wolSent) {
          console.error(`[wake:${requestId}] Failed to send WoL packet.`);
          return {
            status: 'error' as const,
            message: 'שליחת חבילת Wake-on-LAN נכשלה.'
          };
        }
        console.log(`[wake:${requestId}] WoL packet dispatched successfully.`);
      } else {
        console.log(`[wake:${requestId}] Dry run enabled; skipping WoL packet.`);
      }

      if (waitBeforePingSeconds > 0) {
        await delay(waitBeforePingSeconds * 1000);
      }

      const pingOutcome = await checkPingWithRetries(
        ipAddress,
        pingTotalTimeoutSeconds,
        pingIntervalSeconds,
        pingSingleTimeoutSeconds
      );

      console.log(`[wake:${requestId}] Ping outcome: ${pingOutcome ? 'alive' : 'offline'}.`);
      return {
        status: pingOutcome ? 'awake' : 'offline',
        message: pingOutcome
          ? 'הטלוויזיה מגיבה לפינג.'
          : 'הטלוויזיה לא הגיבה לפינג בזמן שהוקצב.',
        pingResponded: pingOutcome
      };
    })();

    try {
      const result = await Promise.race([
        wakeOperation,
        delay(operationTimeoutMs).then(() => ({
          status: 'timeout' as const,
          message: 'הבקשה חרגה ממגבלת הזמן שנקבעה.',
          pingResponded: false
        }))
      ]);

      if (result.status === 'error') {
        return c.json({
          ...details,
          status: 'error',
          message: result.message
        }, 500);
      }

      if (result.status === 'timeout') {
        console.warn(`[wake:${requestId}] Request timed out after ${operationTimeoutMs}ms.`);
        return c.json({
          ...details,
          status: 'timeout',
          message: result.message
        }, 504);
      }

      const statusCode = result.status === 'awake' ? 200 : 504;
      return c.json({
        ...details,
        status: result.status,
        message: result.message
      }, statusCode);
    } catch (error: any) {
      console.error(`[wake:${requestId}] Unexpected error`, error);
      return c.json({
        ...details,
        status: 'error',
        message: error?.message ?? 'אירעה שגיאה בלתי צפויה.'
      }, 500);
    }
}
