import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';


import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';
const app = new Hono();
const port = 3005;

// Serve static files for the frontend
app.use(serveStatic({ root: './public' }));

// Define the WebSocket proxy route
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    let tvWs: WebSocket | null = null;

    return {
      onOpen: (evt, clientWs) => {
        console.log('Client connected to proxy');

        const tvIp = c.req.query('ip');
        if (!tvIp) {
          console.error('Client connected without TV IP.');
          clientWs.close(1008, 'TV IP address is required');
          return;
        }

        console.log(`Attempting to proxy to TV at ${tvIp}`);
        const tvWsUrl = `wss://${tvIp}:3001`;

        tvWs = new WebSocket(tvWsUrl, {

        });

        // TV WebSocket event handlers
        tvWs.addEventListener('open', () => {
          console.log('Proxy connected to TV.');
          if (clientWs.readyState === 1) { // OPEN
            clientWs.send(JSON.stringify({ type: 'proxy_connected' }));
          }
        });

        tvWs.addEventListener('message', (event) => {
          // Forward message from TV to client
          if (clientWs.readyState === 1) { // OPEN
            console.log('\n' + 'recived message from remote:');
            console.log(event.data);

            clientWs.send(event.data);
            console.log('\n' + 'recived message from remote:');
            console.log(event.data);

            clientWs.send(event.data);
          }
        });

        tvWs.addEventListener('close', (event) => {
          console.log(`Connection to TV closed. Code: ${event.code}`);
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
