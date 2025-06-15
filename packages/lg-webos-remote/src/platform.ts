// This file helps in abstracting platform-specific implementations.
import type { WebSocket as NodeWebSocketType } from "ws";
type BrowserWebsocket = Window['window']['WebSocket']['prototype'];

export type AnyWebSocket = BrowserWebsocket | NodeWebSocketType;
/**
 * Dynamically gets the appropriate WebSocket implementation based on the runtime environment.
 * In a browser, it returns the native window.WebSocket.
 * In Node.js or Bun, it dynamically imports and returns the implementation from the 'ws' library.
 * @returns A promise that resolves to the WebSocket constructor.
 */
export async function getWebSocketImplementation(url: string, proxyUrl?: string): Promise<BrowserWebsocket> {

    const finalUrl = proxyUrl ? `${proxyUrl}?targetUrl=${encodeURIComponent(url)}` : url;

    const isBrowser = !!globalThis.window;
    if (isBrowser) {

        return new globalThis.window.WebSocket(finalUrl);
    } else {
        // Dynamically import 'ws' for Node.js/Bun environments.
        const { WebSocket: NodeWebSocket } = await import('ws');

        const wsOptions = {
            rejectUnauthorized: false // Option for 'ws' library in Node.js
        };

        return new NodeWebSocket(finalUrl, wsOptions) as unknown as BrowserWebsocket;

    }
}