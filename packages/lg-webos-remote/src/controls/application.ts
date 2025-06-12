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
export async function launchApp(remote: WebOSRemote, appId: string, options: LaunchAppParams = {}): Promise<void> {
    const payload = { id: appId, ...options };
    await remote.sendMessage({ type: 'request', uri: 'ssap://system.launcher/launch', payload });
}

/**
 * סוגר אפליקציה.
 * @param remote - מופע של WebOSRemote.
 * @param appId - מזהה האפליקציה.
 * @returns הבטחה שמסתיימת כאשר הפעולה הושלמה.
 */
export async function closeApp(remote: WebOSRemote, appId: string): Promise<void> {
    await remote.sendMessage({ type: 'request', uri: 'ssap://system.launcher/close', payload: { id: appId } });
}

/**
 * מחזיר מידע על האפליקציה הפעילה בחזית.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמחזירה מידע על האפליקציה.
 */
export async function getForegroundAppInfo(remote: WebOSRemote): Promise<ForegroundAppInfo> {
    const response = await remote.sendMessage({ type: 'request', uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo' });
    return response.payload as ForegroundAppInfo;
}

/**
 * מחזיר את רשימת האפליקציות המותקנות.
 * @param remote - מופע של WebOSRemote.
 * @returns הבטחה שמחזירה מערך של אפליקציות.
 */
export async function listApps(remote: WebOSRemote): Promise<any[]> {
    const response = await remote.sendMessage({ type: 'request', uri: 'ssap://com.webos.applicationManager/listApps' });
    return response.payload.apps;
}