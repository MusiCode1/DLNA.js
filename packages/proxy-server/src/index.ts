import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';
import { WebOSRemote, WebOSResponse } from 'lg-webos-remote';


import { createBunWebSocket } from 'hono/bun'
import type { ServerWebSocket } from 'bun'

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>()

// ...
const app = new Hono();
const port = 3005;


app.use(serveStatic({ root: './public' }));

// app.get('/', serveStatic({ path: './index.html', root: './public' }));
app.get('/proxy', (c) => {
  // The WebSocket server will handle this
  return c.text('Upgrading to WebSocket', 426);
});

app.get('ws', upgradeWebSocket((c) => {

  let remote: WebOSRemote | null = null;

  return {
    onOpen(event, ws) {

      try {

        const ip = c.req.query('ip');
        const clientKey = c.req.query('clientKey');

        if (!ip) {
          ws.close(1008, 'IP address is required');
          return;
        }

        console.log('Client connected');

        console.log('Connecting to TV at IP:', ip, 'with clientKey:', clientKey);
        remote = new WebOSRemote({ ip, clientKey: clientKey ?? undefined });

        remote.on('connect', () => {
          console.log('Connected to TV');
          ws.send(JSON.stringify({ type: 'status', payload: 'connected' }));
        });


        remote.on('message', (message: WebOSResponse) => {

          const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
          console.log('Message from TV:', parsedMessage);
          ws.send(parsedMessage);
        });

        remote.on('error', (error: Error) => {
          console.error('TV connection error:', error);
          ws.close(1011, 'TV connection error');
        });

        remote.on('disconnect', (code, reason) => {
          console.log('TV disconnected:', code, reason);
          
          console.log('Connection to TV closed');
          ws.close(1000, 'TV connection closed');
        });

        remote.ws?.on('error', (error: Error) => {
          console.error('WebSocket error:', error);
          ws.close(1011, 'WebSocket error');
        });

        remote.ws?.on('open', () => {
          console.log('WebSocket connection to TV opened');
        });

        remote.connect().catch((error) => {
          console.error('Failed to connect to TV:', error);
          ws.close(1011, 'Failed to connect to TV');
        }).then(() => {
          console.log('Remote connection established');
        });

        console.log('WebSocket connection opened:', event);

      } catch (error) {
        console.error('Error during WebSocket connection:', error);
        ws.close(1011, 'Internal server error');

      }

    },

    onClose(evt, ws) {
      console.log('Client disconnected');
      remote?.disconnect();
      console.log('WebSocket connection closed:', evt.code, evt.reason);
    },

    onError(err, ws) {
      console.error('WebSocket error:', err, ws);
      ws.close(1011, 'Internal server error');

      console.error('WebSocket error:', err);
      remote?.disconnect();
    },

    onMessage(msg, ws) {
      console.log('WebSocket message received:', msg, ws);

      try {
        const message = JSON.parse(msg.toString());
        remote?.sendMessage(message);
        ws.send(JSON.stringify({ type: 'status', payload: 'message received' }));
      } catch (error) {
        console.error('Failed to parse or send client message:', error);
        ws.close(1008, 'Invalid message format');
      }
    }



  }

}))

export default {
  fetch: app.fetch,
  websocket,
  port
}

