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
export async function turnOff(remote: WebOSRemote): Promise<void> {
    await remote.sendMessage({ type: 'request', uri: 'ssap://system/turnOff' });
}

/**
 * מציג הודעת "טוסט" על מסך הטלוויזיה.
 * @param remote - מופע של WebOSRemote.
 * @param message - ההודעה להצגה.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export async function createToast(remote: WebOSRemote, message: string): Promise<void> {
    await remote.sendMessage({ type: 'request', uri: 'ssap://system.notifications/createToast', payload: { message } });
}