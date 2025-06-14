/**
 * # WebOS TV Types
 * הגדרות טיפוסים עבור ספריית השליטה בטלוויזיות LG WebOS.
 */

/**
 * מבנה הודעה כללית שנשלחת לטלוויזיה.
 */
export interface WebOSMessage {
    type: 'register' | 'request' | 'subscribe' | 'unsubscribe';
    id?: string;
    uri?: string;
    payload?: any;
}

/**
 * מבנה תשובה כללית שמתקבלת מהטלוויזיה.
 */
export interface WebOSResponse {
    type: 'registered' | 'response' | 'error' | 'pong';
    id: string;
    payload?: any;
    error?: string;
}

export interface ProxyConnectedMessage {
    type: 'proxy_connected'
}

/**
 * מידע על עוצמת השמע.
 */
export interface VolumeStatus {
    volume: number;
    muted: boolean;
    soundOutput: string;
}

/**
 * מידע על האפליקציה הפעילה.
 */
export interface ForegroundAppInfo {
    appId: string;
    windowId: string;
    processId: string;
}