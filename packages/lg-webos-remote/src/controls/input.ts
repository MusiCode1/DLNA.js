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
function connectToInputSocket(remote: WebOSRemote): Promise<void> {
    return new Promise((resolve, reject) => {
        if (remote.inputWs && remote.inputWs.readyState === WebSocket.OPEN) {
            return resolve();
        }

        const id = remote.sendMessage('request', 'ssap://com.webos.service.networkinput/getPointerInputSocket');

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.socketPath) {
                    return reject(new Error(message.error || 'Failed to get pointer input socket'));
                }

                const socketPath = message.payload.socketPath;
                remote.inputWs = new WebSocket(socketPath);

                remote.inputWs.on('open', () => {
                    console.log('Connected to input socket');
                    resolve();
                });

                remote.inputWs.on('error', (error) => {
                    console.error('Input socket error:', error);
                    remote.inputWs = null;
                    // לא לדחות את ההבטחה כאן, כדי לאפשר ניסיונות חוזרים
                });

                remote.inputWs.on('close', () => {
                    console.log('Input socket closed');
                    remote.inputWs = null;
                });
            }
        };
        remote.on('message', messageHandler);
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