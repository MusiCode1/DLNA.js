// This file helps in abstracting platform-specific implementations.

/**
 * Dynamically gets the appropriate WebSocket implementation based on the runtime environment.
 * In a browser, it returns the native window.WebSocket.
 * In Node.js or Bun, it dynamically imports and returns the implementation from the 'ws' library.
 * @returns A promise that resolves to the WebSocket constructor.
 */
export async function getWebSocketImplementation(): Promise<any> {
    if (globalThis.window) {
        return globalThis.window.WebSocket;
    } else {
        // Dynamically import 'ws' for Node.js/Bun environments.
        const { default: NodeWebSocket } = await import('ws');
        return NodeWebSocket;
    }
}