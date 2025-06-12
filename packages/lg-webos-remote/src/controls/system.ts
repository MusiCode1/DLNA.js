import type { WebOSRemote } from '../index';
import type { WebOSResponse } from '../types';

/**
 * # System Control
 * פונקציות לשליטה על מערכת הטלוויזיה.
 */

/**
 * מכבה את הטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export async function turnOff(remote: WebOSRemote): Promise<any> {

    try {
        const res = await remote.sendMessage({ type: 'request', uri: 'ssap://system/turnOff' });

        return res

    } catch (error) {

        throw new Error(`Failed to send turnOff message: ${error instanceof Error ? error.message : String(error)}`);

    }
}

/**
 * מציג הודעת "טוסט" על מסך הטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @param message - ההודעה להצגה.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export function createToast(remote: WebOSRemote, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://system.notifications/createToast', { message });

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to create toast'));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
}