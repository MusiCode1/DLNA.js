import WebSocket from 'ws';
import type { WebOSRemote } from '../index';
import type { WebOSResponse } from '../types';

/**
 * # Input Control
 * פונקציות לשליטה על קלט (כפתורים, עכבר וכו').
 */

/**
 * מתחבר לשקע הקלט המיוחד של הטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמסתיימת כאשר החיבור נוצר.
 */
async function connectToInputSocket(remote: WebOSRemote): Promise<void> {
    if (remote.inputWs && remote.inputWs.readyState === WebSocket.OPEN) {
        return;
    }

    const response = await remote.sendMessage({ type: 'request', uri: 'ssap://com.webos.service.networkinput/getPointerInputSocket' });
    if (!response.payload?.socketPath) {
        throw new Error('Failed to get pointer input socket path');
    }

    const socketPath = response.payload.socketPath;
    const inputWs = new WebSocket(socketPath);
    remote.inputWs = inputWs;

    return new Promise((resolve, reject) => {
        inputWs.on('open', () => {
            console.log('Connected to input socket');
            resolve();
        });

        inputWs.on('error', (error: Error) => {
            console.error('Input socket error:', error);
            if (remote.inputWs === inputWs) {
                remote.inputWs = null;
            }
            reject(error); // It's better to reject on error
        });

        inputWs.on('close', () => {
            console.log('Input socket closed');
            if (remote.inputWs === inputWs) {
                remote.inputWs = null;
            }
        });
    });
}

/**
 * שולח פקודת כפתור לטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @param buttonName - שם הכפתור (למשל, 'UP', 'DOWN', 'ENTER').
 * @returns הבטחה שמסתיימת כאשר הפקודה נשלחה.
 */
export async function sendButton(remote: WebOSRemote, buttonName: string): Promise<void> {
    if (!remote.inputWs || remote.inputWs.readyState !== WebSocket.OPEN) {
        await connectToInputSocket(remote);
    }

    if (!remote.inputWs) {
        throw new Error('Could not connect to input socket');
    }

    const message = `type:button\nname:${buttonName}\n`;
    remote.inputWs.send(message);
}