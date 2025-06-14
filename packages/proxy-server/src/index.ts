import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';
import { WebOSRemote, WebOSResponse } from 'lg-webos-remote';
import type { Server } from 'http';

const app = new Hono();
const port = 3005;

app.use(serveStatic({ root: './public' }));

// app.get('/', serveStatic({ path: './index.html', root: './public' }));
app.get('/proxy', (c) => {
  // The WebSocket server will handle this
  return c.text('Upgrading to WebSocket', 426);
});

const server = serve({
  fetch: app.fetch,
  port,
}) as Server;

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const ip = url.searchParams.get('ip');
  const clientKey = url.searchParams.get('clientKey');

  if (!ip) {
    ws.close(1008, 'IP address is required');
    return;
  }

  console.log('Client connected');
  const remote = new WebOSRemote({ ip, clientKey: clientKey ?? undefined });

  ws.on('message', (data) => {
    console.log('Message from client:', data.toString());
    try {
      const message = JSON.parse(data.toString());
      remote.sendMessage(message);
    } catch (error) {
      console.error('Failed to parse or send client message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    remote.disconnect();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    remote.disconnect();
  });

  remote.on('connect', () => {
    console.log('Connected to TV');
    ws.send(JSON.stringify({ type: 'status', payload: 'connected' }));
  });

  remote.on('message', (message: WebOSResponse) => {
    console.log('Message from TV:', message);
    ws.send(JSON.stringify(message));
  });

  remote.on('error', (error: Error) => {
    console.error('TV connection error:', error);
    ws.close(1011, 'TV connection error');
  });

  remote.on('disconnect', () => {
    console.log('Connection to TV closed');
    ws.close(1000, 'TV connection closed');
  });

  remote.connect().catch((error) => {
    console.error('Failed to connect to TV:', error);
    ws.close(1011, 'Failed to connect to TV');
  });
});

console.log(`Server is running on port ${port}`);