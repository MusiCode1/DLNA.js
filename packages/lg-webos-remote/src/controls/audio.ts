import type { WebOSRemote } from '../index';
import type { VolumeStatus, WebOSResponse } from '../types';

/**
 * # Audio Control
 * פונקציות לשליטה על השמע בטלוויזיה.
 */

/**
 * מחזיר את מצב הווליום הנוכחי.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמחזירה את מצב הווליום.
 */
export async function getVolume(remote: WebOSRemote): Promise<VolumeStatus> {
    const response = await remote.sendMessage({ type: 'request', uri: 'ssap://audio/getVolume' });
    return response.payload as VolumeStatus;
}

/**
 * מגדיר את עוצמת הווליום.
 * @param remote - מופע של WebOSRemote.
 * @param volume - עוצמת הווליום (0-100).
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export async function setVolume(remote: WebOSRemote, volume: number): Promise<void> {
    await remote.sendMessage({
        type: 'request',
        uri: 'ssap://audio/setVolume',
        payload: {
            volume: Math.min(100, Math.max(0, volume))
        }
    });
}

/**
 * משתיק או מבטל השתקה.
 * @param remote - מופע של WebOSRemote.
 * @param mute - `true` להשתקה, `false` לביטול.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export async function setMute(remote: WebOSRemote, mute: boolean): Promise<void> {
    await remote.sendMessage({ type: 'request', uri: 'ssap://audio/setMute', payload: { mute } });
}

/**
 * מגביר את הווליום.
 * @param remote - מופע של WebOSRemote.
 */
export function volumeUp(remote: WebOSRemote): void {
    remote.sendRaw({ type: 'request', uri: 'ssap://audio/volumeUp' });
}

/**
 * מנמיך את הווליום.
 * @param remote - מופע של WebOSRemote.
 */
export function volumeDown(remote: WebOSRemote): void {
    remote.sendRaw({ type: 'request', uri: 'ssap://audio/volumeDown' });
}