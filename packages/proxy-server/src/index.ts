import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import axios from 'axios';
import * as path from "path";
import * as url from "url";

import { sendWakeOnLan, checkPingWithRetries } from 'wake-on-lan';

import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';
const app = new Hono();
const port = 3005;
let wakeRequestCounter = 0;

if (!__dirname) {
  // @ts-ignore
  const filePathUrl = import.meta.url; // המרת import.meta.url לנתיב קובץ רגיל
  const filePath = url.fileURLToPath(filePathUrl); // המרת URL לקובץ לנתיב קובץ רגיל

  const dirname = path.dirname(filePath);
  __dirname = dirname;
}

const publicAbsolutePathDirectory = path.join(__dirname, '..', 'public');
const publicRelativePathDirectory = 'public';

// Serve static files for the frontend
// מיקום יחסי!!
app.use(serveStatic({
  root: publicRelativePathDirectory,
  onNotFound: (path, c) => {
    const text = `Static file not found: ${path}` +
      '\n' + `this path: ${publicAbsolutePathDirectory}` +
      '\n' + `__dirname: ${__dirname}`;

    console.warn(text);

    c.text(text, 404);

  },

}));

// Generic proxy for fetching resources from the TV to solve CORS issues.
// This supports streaming the response body.
app.get('/proxy', async (c) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) {
    return c.text('URL parameter is required', 400);
  }

  try {
    const response = await axios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream',
    });

    // Although c.body(stream) handles piping implicitly,
    // we can be more explicit for clarity.
    const stream = response.data;

    c.status(response.status as any);
    for (const key in response.headers) {
      if (Object.prototype.hasOwnProperty.call(response.headers, key)) {
        const value = response.headers[key];
        if (value) {
          c.header(key, Array.isArray(value) ? value.join(', ') : value.toString());
        }
      }
    }

    // Hono's body method handles the stream piping.
    return c.body(stream);

  } catch (error: any) {
    console.error(`Proxy error for ${targetUrl}:`, error.message);
    return c.text(`Proxy error: ${error.message}`, 500);
  }
});

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

app.post('/api/wake', async (c) => {
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
      if (waitBeforePingSeconds > 0) {
        await delay(waitBeforePingSeconds * 1000);
      }
    } else {
      console.log(`[wake:${requestId}] Dry run enabled; skipping WoL packet.`);
    }

    const pingOutcome = dryRun
      ? true
      : await checkPingWithRetries(
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
});

// Define the WebSocket proxy route
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    let tvWs: WebSocket | null = null;

    return {
      onOpen: (evt, clientWs) => {
        console.log('Client connected to proxy');

        const targetUrl = c.req.query('targetUrl');
        if (!targetUrl) {
          console.error('Client connected without targetUrl.');
          clientWs.close(1008, 'targetUrl is required');
          return;
        }

        console.log(`Attempting to proxy to ${targetUrl}`);

        tvWs = new WebSocket(targetUrl, {});

        // TV WebSocket event handlers
        tvWs.addEventListener('open', () => {
          console.log('Proxy connected to TV.', { targetUrl });
          if (clientWs.readyState === 1) { // OPEN
            clientWs.send(JSON.stringify({ type: 'proxy_connected' }));
          }
        });

        tvWs.addEventListener('message', (event) => {
          // Forward message from TV to client
          if (clientWs.readyState === 1) { // OPEN
            console.log('\n' + 'recived message from remote:', { targetUrl });
            console.log(event.data);

            clientWs.send(event.data);
            console.log('\n' + 'recived message from remote:', { targetUrl });
            console.log(event.data);

            clientWs.send(event.data);
          }
        });

        tvWs.addEventListener('close', (event) => {
          console.log(`Connection to TV closed. Code: ${event.code}`, { targetUrl });
          if (clientWs.readyState === 1) { // OPEN
            clientWs.close(event.code, event.reason);
          }
        });

        tvWs.addEventListener('error', (error) => {
          const errorMessage = (error as any).message || 'Unknown TV connection error';
          console.error('Error connecting to TV:', errorMessage);
          if (clientWs.readyState === 1) { // OPEN
            clientWs.close(1011, `TV connection error: ${errorMessage}`);
          }
        });
      },
      onMessage: (evt, ws) => {
        // Forward message from client to TV
        if (tvWs && tvWs.readyState === 1) { // WebSocket.OPEN
          console.log('\n' + 'Recived message from client:');
          console.log(evt.data.toString());

          console.log('\n' + 'Recived message from client:');
          console.log(evt.data.toString());

          tvWs.send(evt.data.toString());
        } else {
          // אם הפרוקסי עדיין לא מחובר לטלוויזיה, שלח שגיאה חזרה ללקוח
          console.error('Message received before proxy connection to TV was established.');
          try {
            const clientMessage = JSON.parse(evt.data.toString());
            if (clientMessage.id) {
              ws.send(JSON.stringify({
                id: clientMessage.id,
                type: 'error',
                error: 'Proxy not connected to TV. Please wait and try again.'
              }));
            }
          } catch (e) {
            console.error('Could not parse client message to send error response.');
          }
        }
      },
      onClose: (evt, ws) => {
        console.log('Client disconnected from proxy.');
        if (tvWs && tvWs.readyState === WebSocket.OPEN) {
          tvWs.close();
        }
      },
      onError: (evt, ws) => {
        console.error('Proxy error from client connection:', evt);
        if (tvWs && tvWs.readyState === WebSocket.OPEN) {
          tvWs.close();
        }
      },
    };
  })
);

console.log(`Server is running on http://localhost:${port}`);
console.log(`WebSocket proxy is available at ws://localhost:${port}/ws`);

export default {
  fetch: app.fetch,
  websocket,
  port
}
