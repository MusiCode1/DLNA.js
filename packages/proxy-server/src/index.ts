import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import axios from 'axios';


import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';
const app = new Hono();
const port = 3005;

// Serve static files for the frontend
app.use(serveStatic({ root: './public' }));

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
