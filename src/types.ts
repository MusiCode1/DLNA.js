// קובץ זה מכיל את כל הגדרות הממשקים והטיפוסים הקשורים ל-UPnP.
import type { ContentDirectory, AVTransport, RenderingControl } from './specificTypes';

/**
 * @hebrew אפשרויות עבור פונקציית הגילוי.
 */
export interface DiscoveryOptions {
    /**
     * @hebrew זמן קצוב כולל (במילישניות) לכל תהליך הגילוי.
     * @default 5000
     */
    timeoutMs?: number;
    /**
     * @hebrew ה-ST (Service Type) לחיפוש.
     * @default "ssdp:all"
     */
    searchTarget?: string;
    /**
     * @hebrew זמן קצוב (במילישניות) לחיפוש על כל ממשק רשת בודד.
     * @default 2000
     */
    discoveryTimeoutPerInterfaceMs?: number;
    /**
     * @hebrew פונקציית קולבק שתוזמן מיד עם קבלת תגובה ייחודית מהתקן SSDP.
     */
    onDeviceFound?: (device: BasicSsdpDevice) => void;
    /**
     * @hebrew האם לנסות לבצע גילוי גם על ממשקי IPv6 Link-Local.
     * @default false
     */
    includeIPv6?: boolean;
    /**
     * @hebrew מאפשר העברת פונקציית לוגינג מותאמת אישית.
     * @default console
     */
    customLogger?: (level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]) => void;
    /**
     * @hebrew רשימת ממשקי רשת ידועה מראש (אופציונלי), במבנה זהה לזה המוחזר מ-`os.networkInterfaces()`.
     * אם לא יסופק, הפונקציה תשתמש ב-`os.networkInterfaces()`.
     */
    networkInterfaces?: NodeJS.Dict<import('os').NetworkInterfaceInfo[]>; // Added import('os') for clarity
}

/**
 * @hebrew מייצג התקן SSDP בסיסי שנמצא.
 */
export interface BasicSsdpDevice {
    /**
     * @hebrew USN (Unique Service Name) של ההתקן.
     */
    usn: string;
    /**
     * @hebrew כתובת ה-URL של קובץ התיאור של ההתקן.
     */
    location: string;
    /**
     * @hebrew מחרוזת השרת של ההתקן.
     */
    server: string;
    /**
     * @hebrew ST (Service Type) של ההתקן.
     */
    st: string;
    /**
     * @hebrew כתובת ה-IP של ההתקן המגיב.
     */
    address: string;
    /**
     * @hebrew כל כותרות התגובה מההתקן.
     */
    responseHeaders: Record<string, string>;
    /**
     * @hebrew חותמת זמן של מציאת ההתקן.
     */
    timestamp: number;
}

/**
 * @hebrew מייצג אייקון של התקן.
 */
export interface DeviceIcon {
    mimetype: string;
    width: number;
    height: number;
    depth: number;
    url: string;
}

/**
 * @hebrew ממשק בסיס לתיאור שירות של התקן.
 */
export interface BaseServiceDescription {
    serviceType: string;
    serviceId: string;
    SCPDURL: string;
    controlURL: string;
    eventSubURL: string;
    actions?: Record<string, Action | undefined>; // ברירת מחדל גנרית, מאפשר undefined כדי להתאים לממשקים ספציפיים
    stateVariables?: StateVariable[];
    scpdError?: string;
}


/**
 * @hebrew מייצג תיאור שירות של התקן, יכול להיות גנרי או ספציפי.
 */
export type ServiceDescription =
    | ContentDirectory.SpecificService
    | AVTransport.SpecificService
    | RenderingControl.SpecificService
    | BaseServiceDescription; // BaseServiceDescription חייב להיות אחרון כ-fallback

// =======================================================================
// הממשקים הבאים קשורים לפרטי SCPD (Service Control Protocol Description)
// =======================================================================

/**
 * @hebrew מייצג ארגומנט של פעולה (Action) בשירות UPnP.
 */
export interface ActionArgument {
    /** @hebrew שם הארגומנט. */
    name: string;
    /** @hebrew כיוון הארגומנט (קלט או פלט). */
    direction: 'in' | 'out';
    /** @hebrew שם משתנה המצב (StateVariable) הקשור לארגומנט זה. */
    relatedStateVariable: string;
    // שדה אפשרי עבור ערך ברירת מחדל או ערכים מותרים, אם רלוונטי וזמין
    // defaultValue?: string;
    // allowedValueList?: string[];
}

/**
 * @hebrew מייצג פעולה (Action) שניתן לבצע על שירות UPnP.
 */
export interface Action {
    /** @hebrew שם הפעולה. */
    name: string;
    /** @hebrew רשימת הארגומנטים של הפעולה (אופציונלי). */
    arguments?: ActionArgument[];
    /**
     * @hebrew פונקציה להפעלת הפעולה ישירות.
     * @param args - אובייקט המכיל את הארגומנטים הנדרשים לפעולה (שם ארגומנט: ערך).
     * @returns הבטחה שתתממש עם אובייקט המכיל את תוצאות הפעולה (ארגומנטים מסוג 'out').
     */
    invoke?: (args: Record<string, any>) => Promise<Record<string, any>>;
}

/**
 * @hebrew מייצג משתנה מצב (State Variable) של שירות UPnP.
 */
export interface StateVariable {
    /** @hebrew שם משתנה המצב. */
    name: string;
    /** @hebrew טיפוס הנתונים של המשתנה (למשל, 'string', 'ui4', 'boolean'). */
    dataType: string;
    /** @hebrew ערך ברירת המחדל של המשתנה (אופציונלי). */
    defaultValue?: string;
    /** @hebrew רשימת ערכים מותרים למשתנה (אופציונלי). */
    allowedValueList?: string[];
    /**
     * @hebrew מציין האם המשתנה שולח אירועים.
     * @description במקור 'sendEvents' ב-XML, שונה ל-camelCase.
     */
    sendEventsAttribute?: boolean;
    /**
     * @hebrew פונקציה לשאילתת ערך משתנה המצב (אם נתמך על ידי השירות).
     * @returns הבטחה שתתממש עם ערך משתנה המצב.
     */
    query?: () => Promise<any>;
    // שדות אופציונליים נוספים לפי הצורך, כגון:
    // min?: string; // ערך מינימלי, אם רלוונטי
    // max?: string; // ערך מקסימלי, אם רלוונטי
    // step?: string; // צעד, אם רלוונטי
}

/**
 * @hebrew מייצג תיאור מלא של התקן (מניתוח XML).
 */
export interface DeviceDescription {
    deviceType: string;
    friendlyName: string;
    manufacturer: string;
    manufacturerURL?: string;
    modelDescription?: string;
    modelName: string;
    modelNumber?: string | number;
    modelURL?: string;
    serialNumber?: string | number;
    UDN: string; // Unique Device Name
    presentationURL?: string;
    iconList?: DeviceIcon[];
    services?: Record<string, ServiceDescription>; // אובייקט של שירותים, המפתח הוא serviceId
    deviceList?: DeviceDescription[]; // התקנים משוננים (נשאר כמערך)
    // שדות שנוספו כדי לשמר מידע מהגילוי הראשוני או מה-location URL
    descriptionUrl?: string; // ה-URL המקורי של קובץ התיאור
    baseURL?: string; // כתובת הבסיס של ההתקן (נגזר מ-locationUrl)
    sourceIpAddress?: string; // כתובת ה-IP של ההתקן כפי שזוהתה בתגובת ה-SSDP
    // שדות נוספים אפשריים מה-XML
}

// =======================================================================
// Types for ContentDirectoryService
// =======================================================================

/**
 * @enum BrowseFlag
 * @description דגלים עבור פעולת Browse של ContentDirectory.
 * @hebrew דגלים עבור פעולת Browse של ContentDirectory.
 */
export enum BrowseFlag {
    BrowseMetadata = "BrowseMetadata",
    BrowseDirectChildren = "BrowseDirectChildren"
}

/**
 * @interface Resource
 * @description מייצג משאב של פריט DIDL-Lite (למשל, קובץ מדיה).
 * @hebrew מייצג משאב של פריט DIDL-Lite (למשל, קובץ מדיה).
 */
export interface Resource {
    uri: string;
    protocolInfo?: string;
    size?: number;
    duration?: string;
    bitrate?: number;
    sampleFrequency?: number;
    bitsPerSample?: number;
    nrAudioChannels?: number;
    resolution?: string;
    colorDepth?: number;
    protection?: string;
    importUri?: string;
    dlnaManaged?: string; // e.g., "01", "10"
    additionalInfo?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any - לתכונות נוספות אפשריות
}

/**
 * @interface DidlLiteItemBase
 * @description ממשק בסיס לפריט DIDL-Lite (יכול להיות container או object).
 * @hebrew ממשק בסיס לפריט DIDL-Lite (יכול להיות container או object).
 */
export interface DidlLiteItemBase {
    id: string;
    parentId: string;
    title: string;
    class: string; // upnp:class
    restricted: boolean;
    writeStatus?: string; // upnp:writeStatus
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any - לתכונות נוספות אפשריות
}

/**
 * @interface DidlLiteContainer
 * @description מייצג קונטיינר (תיקייה) ב-DIDL-Lite.
 * @extends DidlLiteItemBase
 * @hebrew מייצג קונטיינר (תיקייה) ב-DIDL-Lite.
 */
export interface DidlLiteContainer extends DidlLiteItemBase {
    childCount?: number;
    searchable?: boolean;
    createClass?: string; // upnp:createClass
    searchClass?: string; // upnp:searchClass
}

/**
 * @interface DidlLiteObject
 * @description מייצג אובייקט (פריט מדיה) ב-DIDL-Lite.
 * @extends DidlLiteItemBase
 * @hebrew מייצג אובייקט (פריט מדיה) ב-DIDL-Lite.
 */
export interface DidlLiteObject extends DidlLiteItemBase {
    resources?: Resource[];
    albumArtURI?: string; // upnp:albumArtURI
    artist?: string; // dc:creator or upnp:artist
    album?: string; // upnp:album
    genre?: string; // upnp:genre
    date?: string; // dc:date
    originalTrackNumber?: number; // upnp:originalTrackNumber
    // ניתן להוסיף כאן עוד שדות ספציפיים לסוגי מדיה שונים
}

/**
 * @interface BrowseResult
 * @description מייצג את התוצאה של פעולת Browse או Search.
 * @hebrew מייצג את התוצאה של פעולת Browse או Search.
 */
export interface BrowseResult {
    items: (DidlLiteContainer | DidlLiteObject)[];
    numberReturned: number;
    totalMatches: number;
    updateID?: string;
    rawResponse?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}





/**
 * @interface SoapResponsePayload
 * @description מייצג את המטען (payload) של תגובת SOAP מוצלחת.
 */
export interface SoapResponsePayload {
    /**
     * @property {object} actionResponse - התוכן הספציפי של <actionNameResponse>.
     */
    actionResponse: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    /**
     * @property {object} raw - כל גוף תגובת ה-SOAP המנותח.
     */
    raw: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * @interface SoapFault
 * @description מייצג שגיאת SOAP.
 */
export interface SoapFault {
    /**
     * @property {string} faultCode - קוד השגיאה של SOAP.
     */
    faultCode: string;
    /**
     * @property {string} faultString - תיאור השגיאה של SOAP.
     */
    faultString: string;
    /**
     * @property {string} [detail] - פרטים נוספים על השגיאה.
     */
    detail?: string;
    /**
     * @property {number} [upnpErrorCode] - קוד שגיאה ספציפי ל-UPnP.
     */
    upnpErrorCode?: number;
    /**
     * @property {string} [upnpErrorDescription] - תיאור שגיאה ספציפי ל-UPnP.
     */
    upnpErrorDescription?: string;
}

/**
 * @interface SoapResponse
 * @description מייצג את התגובה המלאה מבקשת SOAP, יכולה להיות הצלחה או שגיאה.
 */
export interface SoapResponse {
    /**
     * @property {boolean} success - האם הבקשה הצליחה.
     */
    success: boolean;
    /**
     * @property {SoapResponsePayload} [data] - המטען של התגובה אם הבקשה הצליחה.
     */
    data?: SoapResponsePayload;
    /**
     * @property {SoapFault} [fault] - פרטי השגיאה אם הבקשה נכשלה.
     */
    fault?: SoapFault;
}

/**
 * @interface ParsedDidlLite
 * @description ממשק פנימי לתוצאת ניתוח DIDL-Lite לפני המיפוי הסופי.
 */
export interface ParsedDidlLite {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    container?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item?: any[];
}