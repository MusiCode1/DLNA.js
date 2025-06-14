import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { createServer } from 'http';

const PORT = 3006;

// We create a simple HTTP server to attach the WebSocket server to.
const server: Server = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({ server });

console.log(`Simple WebSocket Proxy Server is starting on port ${PORT}...`);

wss.on('connection', (clientWs, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const tvIp = url.searchParams.get('ip');

    if (!tvIp) {
        console.error('Client connected without specifying a TV IP address.');
        clientWs.close(1008, 'TV IP address is required as a query parameter (e.g., ?ip=192.168.1.10)');
        return;
    }

    console.log(`Client connected, attempting to proxy to TV at ${tvIp}`);

    const tvWsUrl = `wss://${tvIp}:3001`;
    const tvWs = new WebSocket(tvWsUrl, {
        rejectUnauthorized: false // Necessary for self-signed certificates on the TV
    });

    // Pipe data from client to TV
    clientWs.on('message', (data) => {
        if (tvWs.readyState === WebSocket.OPEN) {
            tvWs.send(data);
        }
    });

    // Pipe data from TV to client
    tvWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
    });

    // Handle client disconnection
    clientWs.on('close', (code, reason) => {
        console.log(`Client disconnected. Code: ${code}, Reason: ${reason.toString()}`);
        if (tvWs.readyState === WebSocket.OPEN || tvWs.readyState === WebSocket.CONNECTING) {
            tvWs.close();
        }
    });

    // Handle TV disconnection
    tvWs.on('close', (code, reason) => {
        console.log(`Connection to TV closed. Code: ${code}, Reason: ${reason.toString()}`);
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
            clientWs.close();
        }
    });

    // Handle errors from the TV connection
    tvWs.on('error', (error) => {
        console.error('Error connecting to TV:', error.message);
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
            clientWs.close(1011, `Failed to connect to TV: ${error.message}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Proxy Server is running and listening on port ${PORT}`);
});