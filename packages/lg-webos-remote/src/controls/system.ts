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
export function turnOff(remote: WebOSRemote): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://system/turnOff');

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to turn off'));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
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