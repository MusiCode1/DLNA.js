import type { WebOSRemote } from '../index';
import type { WebOSResponse, ForegroundAppInfo } from '../types';

/**
 * # Application Control
 * פונקציות לשליטה על אפליקציות בטלוויזיה.
 */

interface LaunchAppParams {
    contentId?: string;
    params?: Record<string, any>;
}

/**
 * מפעיל אפליקציה.
 * @param remote - מופע של WebOSRemote.
 * @param appId - מזהה האפליקציה.
 * @param options - פרמטרים נוספים להפעלה.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export function launchApp(remote: WebOSRemote, appId: string, options: LaunchAppParams = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        const payload = { id: appId, ...options };
        const id = remote.sendMessage('request', 'ssap://system.launcher/launch', payload);

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || `Failed to launch app ${appId}`));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * סוגר אפליקציה.
 * @param remote - מופע של WebOSRemote.
 * @param appId - מזהה האפליקציה.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export function closeApp(remote: WebOSRemote, appId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://system.launcher/close', { id: appId });

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || `Failed to close app ${appId}`));
                }
                resolve();
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * מחזיר מידע על האפליקציה הפעילה בחזית.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמחזירה מידע על האפליקציה.
 */
export function getForegroundAppInfo(remote: WebOSRemote): Promise<ForegroundAppInfo> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://com.webos.applicationManager/getForegroundAppInfo');

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to get foreground app info'));
                }
                resolve(message.payload as ForegroundAppInfo);
            }
        };
        remote.on('message', messageHandler);
    });
}

/**
 * מחזיר את רשימת האפליקציות המותקנות.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמחזירה מערך של אפליקציות.
 */
export function listApps(remote: WebOSRemote): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const id = remote.sendMessage('request', 'ssap://com.webos.applicationManager/listApps');

        const messageHandler = (message: WebOSResponse) => {
            if (message.id === id) {
                remote.off('message', messageHandler);
                if (message.type === 'error' || !message.payload?.returnValue) {
                    return reject(new Error(message.error || 'Failed to list apps'));
                }
                resolve(message.payload.apps);
            }
        };
        remote.on('message', messageHandler);
    });
}