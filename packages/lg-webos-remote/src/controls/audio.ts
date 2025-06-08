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
export function getVolume(remote: WebOSRemote): Promise<VolumeStatus> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://audio/getVolume');
        
        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error') {
                    return reject(new Error(message.error));
                }
                resolve(message.payload.volumeStatus as VolumeStatus);
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * מגדיר את עוצמת הווליום.
 * @param remote - מופע של WebOSRemote.
 * @param volume - עוצמת הווליום (0-100).
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export function setVolume(remote: WebOSRemote, volume: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://audio/setVolume', {
            volume: Math.min(100, Math.max(0, volume))
        });

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to set volume'));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * משתיק או מבטל השתקה.
 * @param remote - מופע של WebOSRemote.
 * @param mute - `true` להשתקה, `false` לביטול.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export function setMute(remote: WebOSRemote, mute: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://audio/setMute', { mute });

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to set mute'));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * מגביר את הווליום.
 * @param remote - מופע של WebOSRemote.
 */
export function volumeUp(remote: WebOSRemote): void {
    remote.sendMessage('request', 'ssap://audio/volumeUp');
}

/**
 * מנמיך את הווליום.
 * @param remote - מופע של WebOSRemote.
 */
export function volumeDown(remote: WebOSRemote): void {
    remote.sendMessage('request', 'ssap://audio/volumeDown');
}