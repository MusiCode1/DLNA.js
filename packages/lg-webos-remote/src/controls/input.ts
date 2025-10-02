import type { WebOSRemote } from '../index';
import type { WebOSResponse } from '../types';
import { getWebSocketImplementation } from "../platform";

/**
 * # Input Control
 * פונקציות לשליטה על קלט (כפתורים, עכבר וכו').
 */

/**
 * מתחבר לשקע הקלט המיוחד של הטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמסתיימת כאשר החיבור נוצר.
 */
export async function connectToInputSocket(remote: WebOSRemote): Promise<void> {
    if (remote.inputWs && remote.inputWs.readyState === 1) { // WebSocket.OPEN
        return;
    }

    const response = await remote.sendMessage({
        type: 'request',
        uri: 'ssap://com.webos.service.networkinput/getPointerInputSocket'
    });
    if (!response.payload?.socketPath) {
        throw new Error('Failed to get pointer input socket path');
    }

    const socketPath = response.payload.socketPath;


    return new Promise(async (resolve, reject) => {

        const proxyUrl = remote.getConfig().proxyUrl;

        const inputWs = await getWebSocketImplementation(socketPath, proxyUrl);
        remote.inputWs = inputWs;
        const onOpen = () => {
            console.log('Connected to input socket');
            resolve();
        };

        const onError = (error: any) => {
            console.error('Input socket error:', error);
            if (remote.inputWs === inputWs) {
                remote.inputWs = null;
            }
            reject(error.message ? new Error(error.message) : new Error('Input socket error'));
        };

        const onClose = () => {
            console.log('Input socket closed');
            if (remote.inputWs === inputWs) {
                remote.inputWs = null;
            }
        };

        inputWs.addEventListener('open', onOpen);
        inputWs.addEventListener('error', onError);
        inputWs.addEventListener('close', onClose);
    });
}

/**
 * שולח פקודת כפתור לטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @param buttonName - שם הכפתור (למשל, 'UP', 'DOWN', 'ENTER').
 * @returns הבטחה שמסתיימת כאשר הפקודה נשלחה.
 */
export async function sendButton(remote: WebOSRemote, buttonName: string): Promise<void> {
    if (!remote.inputWs || remote.inputWs.readyState !== 1) { // WebSocket.OPEN
        await connectToInputSocket(remote);
    }

    if (!remote.inputWs) {
        throw new Error('Could not connect to input socket');
    }

    const message = `type:button\nname:${buttonName}\n\n`;
    remote.inputWs.send(message);
}