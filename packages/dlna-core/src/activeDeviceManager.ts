// קובץ: packages/dlna-core/src/activeDeviceManager.ts

import { EventEmitter } from 'events';
import * as os from 'node:os'; // הוספת ייבוא למודול os
import {
  ActiveDeviceManagerOptions,
  ApiDevice,
  BasicSsdpDevice, // הוספת ייבוא
  DiscoveryDetailLevel,
  FullDeviceDescription, // הוספת ייבוא
  DeviceDescription, // הוספת ייבוא
} from './types';
import { createSocketManager } from './ssdpSocketManager';
import type { RemoteInfo } from 'node:dgram'; // הוספת ייבוא
import {
  parseHttpPacket,
  ParsedHttpPacket, // הוספת ייבוא
  HTTP_REQUEST_TYPE, // הוספת ייבוא
  HTTP_RESPONSE_TYPE, // הוספת ייבוא
} from './genericHttpParser';
import { createModuleLogger } from './logger'; // הוספת ייבוא ללוגר
import { processUpnpDevice } from './upnpDeviceProcessor'; // הוספת ייבוא

const logger = createModuleLogger('ActiveDeviceManager'); // אתחול לוגר מקומי
type ReturnTypeOfCreateSocketManager = Awaited<ReturnType<typeof createSocketManager>>; // הטיפוס הנכון לאחר await createSocketManager
/**
 * @internal
 * מחלקה לניהול גילוי רציף של התקני UPnP.
 */
export class ActiveDeviceManager extends EventEmitter {
  private options: Required<ActiveDeviceManagerOptions>;
  private activeDevices: Map<string, ApiDevice>;
  private socketManager: ReturnTypeOfCreateSocketManager | null;
  private mSearchIntervalId: NodeJS.Timeout | null;
  private cleanupIntervalId: NodeJS.Timeout | null;
  private isRunning: boolean;

  constructor(options?: ActiveDeviceManagerOptions) {
    super();

    // אתחול אופציות עם ברירות מחדל
    this.options = {
      searchTarget: options?.searchTarget ?? 'ssdp:all',
      mSearchIntervalMs: options?.mSearchIntervalMs ?? 10000, // 10 שניות
      deviceCleanupIntervalMs: options?.deviceCleanupIntervalMs ?? 30000, // 30 שניות
      includeIPv6: options?.includeIPv6 ?? false,
      detailLevel: options?.detailLevel ?? DiscoveryDetailLevel.Basic,
      onRawSsdpMessage: options?.onRawSsdpMessage ?? (() => { /* פונקציה ריקה */ }),
      networkInterfaces: options?.networkInterfaces ?? [], // אתחול למערך ריק אם לא סופק
    };

    this.activeDevices = new Map<string, ApiDevice>();
    this.socketManager = null;
    this.mSearchIntervalId = null;
    this.cleanupIntervalId = null;
    this.isRunning = false;
  }

  /**
   * @hebrew מפענח הודעת SSDP גולמית וממפה אותה לאובייקט BasicSsdpDevice.
   * @param msg - הודעת ה-SSDP הגולמית.
   * @param rinfo - מידע על השולח.
   * @returns אובייקט BasicSsdpDevice אם הפענוח הצליח, אחרת null.
   */
  private _parseAndMapSsdpMessage(msg: Buffer, rinfo: RemoteInfo): BasicSsdpDevice | null {
    const msgString = msg.toString('utf-8');
    let parserType: typeof HTTP_REQUEST_TYPE | typeof HTTP_RESPONSE_TYPE;

    // קביעת סוג הפרסר על סמך תוכן ההודעה
    // SSDP NOTIFY ו-M-SEARCH הן בקשות HTTP
    // תגובות SSDP מתחילות ב-HTTP/
    if (msgString.startsWith('NOTIFY') || msgString.startsWith('M-SEARCH')) {
      parserType = HTTP_REQUEST_TYPE;
    } else if (msgString.startsWith('HTTP/')) {
      parserType = HTTP_RESPONSE_TYPE;
    } else {
      logger.debug('_parseAndMapSsdpMessage: Unknown SSDP message type, cannot determine parser type.', { remoteAddress: rinfo.address, messageStart: msgString.substring(0, 20) });
      return null;
    }

    const parsedPacket: ParsedHttpPacket | null = parseHttpPacket(msg, parserType);

    if (!parsedPacket) {
      logger.debug(`_parseAndMapSsdpMessage: Received null parsedPacket from parseHttpPacket, indicating a parsing failure.`, { remoteAddress: rinfo.address });
      return null;
    }

    const { headers, method, statusCode, statusMessage, versionMajor, versionMinor } = parsedPacket;
    const normalizedHeaders = headers; // headers כבר מנורמלים ב-parseHttpPacket

    const httpVersionString = (versionMajor !== undefined && versionMinor !== undefined)
      ? `${versionMajor}.${versionMinor}`
      : undefined;

    const location = normalizedHeaders['location'];
    const usn = normalizedHeaders['usn'];
    const ntHeader = normalizedHeaders['nt'];
    const ntsHeader = normalizedHeaders['nts'];
    const stHeader = normalizedHeaders['st'];
    const server = normalizedHeaders['server'];
    const cacheControlHeader = normalizedHeaders['cache-control'];

    let cacheControlMaxAge: number | undefined = undefined;
    if (cacheControlHeader) {
      const maxAgeMatch = cacheControlHeader.match(/max-age=(\d+)/i);
      if (maxAgeMatch && maxAgeMatch[1]) {
        cacheControlMaxAge = parseInt(maxAgeMatch[1], 10);
      }
    }

    if (!usn || usn.trim() === '') { // בדיקה מורחבת: USN חסר, ריק, או רק רווחים
      logger.debug('_parseAndMapSsdpMessage: USN is missing, empty, or only whitespace in SSDP message headers. Ignoring message.', { usnValueReceived: usn, remoteAddress: rinfo.address, headers: normalizedHeaders });
      return null;
    }

    const finalSt = stHeader || ntHeader;
    if (!finalSt) {
      logger.debug('_parseAndMapSsdpMessage: ST/NT is missing in SSDP message headers.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
      return null;
    }

    // קביעת messageType על סמך parserType
    const messageType = parserType === HTTP_REQUEST_TYPE ? 'REQUEST' : 'RESPONSE';

    const basicDevice: BasicSsdpDevice = {
      usn,
      location: location || '', // Location יכול להיות חסר, למשל בהודעות M-SEARCH
      server: server || '', // Server יכול להיות חסר
      st: finalSt,
      remoteAddress: rinfo.address,
      remotePort: rinfo.port,
      headers: normalizedHeaders,
      timestamp: Date.now(),
      messageType,
      httpMethod: method,
      httpStatusCode: statusCode,
      httpStatusMessage: statusMessage,
      cacheControlMaxAge,
      nts: ntsHeader,
      httpVersion: httpVersionString,
      detailLevelAchieved: DiscoveryDetailLevel.Basic, // הוספת שדה חובה
    };

    if (basicDevice.httpMethod === 'M-SEARCH') {
      logger.debug(`_parseAndMapSsdpMessage: Received M-SEARCH request from ${rinfo.address}:${rinfo.port}. Ignoring for now.`, { usn: basicDevice.usn });
      // ממשיכים להחזיר את ההתקן המפוענח גם אם זה M-SEARCH
    }

    // בדיקה נוספת: Location הוא שדה חובה עבור הודעות שאינן M-SEARCH ושיש להן משמעות לגילוי התקן
    if (basicDevice.httpMethod !== 'M-SEARCH' && messageType === 'RESPONSE' && !location) {
      logger.debug('_parseAndMapSsdpMessage: Location is missing in SSDP response headers.', { remoteAddress: rinfo.address, usn: basicDevice.usn, headers: normalizedHeaders });
      return null;
    }


    return basicDevice;
  }

  /**
   * @hebrew מטפל בהודעת SSDP לאחר פענוח.
   * מנהל את רשימת המכשירים הפעילים ופולט אירועים.
   * @param msg - הודעת ה-SSDP הגולמית.
   * @param rinfo - מידע על השולח.
   * @param socketType - סוג הסוקט שקיבל את ההודעה (למשל, 'ipv4', 'ipv6').
   */
  private async _handleSsdpMessage(msg: Buffer, rinfo: RemoteInfo, socketType: string): Promise<void> {
    const basicDevice = this._parseAndMapSsdpMessage(msg, rinfo);

    if (!basicDevice) {
      // הלוג נרשם כבר ב-_parseAndMapSsdpMessage
      return;
    }

    if (!basicDevice.usn) {
      logger.error('_handleSsdpMessage: Received SSDP message without USN. Ignoring.', { remoteAddress: rinfo.address, headers: basicDevice.headers });
      return;
    }

    // הודעת byebye לא חייבת להכיל location
    if (basicDevice.nts !== 'ssdp:byebye' && !basicDevice.location) {
      logger.error('_handleSsdpMessage: Received SSDP message (not byebye) without Location. Ignoring.', { usn: basicDevice.usn, remoteAddress: rinfo.address, headers: basicDevice.headers });
      return;
    }

    // טיפול בהודעת ssdp:byebye
    if (basicDevice.nts === 'ssdp:byebye') {
      if (this.activeDevices.has(basicDevice.usn)) {
        const lostDevice = this.activeDevices.get(basicDevice.usn);
        this.activeDevices.delete(basicDevice.usn);
        // ניצור אובייקט דומה ל-ApiDevice עבור האירוע, אך עם המידע מ-basicDevice
        // מאחר ו-lostDevice עשוי להיות מורכב יותר, ו-basicDevice הוא המידע העדכני מההודעה
        const eventDeviceData: Partial<ApiDevice> = {
          ...basicDevice, // כולל usn, location, server, st, remoteAddress, remotePort, headers, detailLevelAchieved
          lastSeen: Date.now(), // למרות שזה byebye, נציין מתי נראה לאחרונה
        };
        this.emit('devicelost', basicDevice.usn, eventDeviceData as ApiDevice); // המרה ל-ApiDevice לצורך האירוע
        logger.info(`_handleSsdpMessage: Device lost (ssdp:byebye): ${basicDevice.usn}`, { usn: basicDevice.usn, remoteAddress: basicDevice.remoteAddress });
      } else {
        logger.debug(`_handleSsdpMessage: Received ssdp:byebye for an unknown device: ${basicDevice.usn}`, { usn: basicDevice.usn, remoteAddress: basicDevice.remoteAddress });
      }
      return;
    }

    // טיפול בהודעות אחרות (alive או תגובה ל-M-SEARCH)
    let expiresAt: number;
    if (basicDevice.cacheControlMaxAge && basicDevice.cacheControlMaxAge > 0) {
      expiresAt = Date.now() + (basicDevice.cacheControlMaxAge * 1000);
    } else {
      // ברירת מחדל אם max-age לא קיים או לא תקין
      expiresAt = Date.now() + (this.options.mSearchIntervalMs * 3); // לדוגמה, פי 3 ממרווח החיפוש
      logger.debug(`_handleSsdpMessage: No valid max-age in CACHE-CONTROL for USN: ${basicDevice.usn}. Using default expiration.`, { usn: basicDevice.usn, headers: basicDevice.headers, defaultExpiresIn: this.options.mSearchIntervalMs * 3 });
    }

    const existingDevice = this.activeDevices.get(basicDevice.usn);

    if (existingDevice) {
      // מכשיר קיים
      existingDevice.lastSeen = Date.now();
      existingDevice.expiresAt = expiresAt;
      // עדכון פרטים בסיסיים מההודעה הנוכחית אם השתנו (למשל, location, server)
      existingDevice.location = basicDevice.location || existingDevice.location;
      existingDevice.server = basicDevice.server || existingDevice.server;
      existingDevice.remoteAddress = basicDevice.remoteAddress; // כתובת IP יכולה להשתנות
      existingDevice.remotePort = basicDevice.remotePort;

      let detailLevelUpdated = false;

      // ודא ש-location קיים לפני קריאה ל-processUpnpDevice אם הוא נדרש שם (למרות שכאן אנו מעבירים את basicDevice כולו)
      if (existingDevice.detailLevelAchieved < this.options.detailLevel && basicDevice.location) {
        logger.debug(`_handleSsdpMessage: Attempting to update details for existing device: ${existingDevice.usn}`, { currentDetailLevel: existingDevice.detailLevelAchieved, requestedDetailLevel: this.options.detailLevel });
        try {
          // processUpnpDevice אינו מקבל existingDevice כפרמטר למזג אליו.
          // הוא מעבד את basicDevice ומחזיר ProcessedDevice חדש.
          // אין לנו AbortSignal כאן, אז הפרמטר השלישי יהיה undefined (ברירת מחדל).
          const processedData = await processUpnpDevice(basicDevice, this.options.detailLevel /*, undefined - AbortSignal */);
          if (processedData) {
            // נמזג את התוצאה מ-processedData לתוך existingDevice.
            // יש לוודא ששדות מ-basicDevice שאינם בהכרח ב-processedData (אם processedData הוא ברמה גבוהה יותר)
            // לא נדרסים אם הם עדכניים יותר ב-basicDevice (למשל, remoteAddress, remotePort).
            // עם זאת, processUpnpDevice אמור להחזיר את כל המידע הרלוונטי מ-basicDevice כבסיס.

            // מיזוג זהיר: שדות מ-processedData גוברים, אך שדות חיוניים כמו usn נשמרים.
            // lastSeen ו-expiresAt כבר עודכנו למעלה.
            const currentUsn = existingDevice.usn; // שמירת ה-USN למקרה ש-processedData מגיע ללא (לא אמור לקרות)
            Object.assign(existingDevice, processedData);
            existingDevice.usn = currentUsn; // הבטחת ה-USN המקורי

            // ודא ש-detailLevelAchieved מעודכן לרמה שהושגה בפועל
            existingDevice.detailLevelAchieved = processedData.detailLevelAchieved || this.options.detailLevel;
            // עדכון שדות נוספים מ-ApiDevice אם צריך, למרות ש-Object.assign אמור לכסות את רובם אם הם קיימים ב-processedData
            existingDevice.lastSeen = Date.now(); // נרענן שוב למקרה שהעיבוד לקח זמן
            existingDevice.expiresAt = expiresAt; // expiresAt חושב לפני כן

            detailLevelUpdated = true;
            logger.info(`_handleSsdpMessage: Successfully updated details for device: ${existingDevice.usn} to level ${existingDevice.detailLevelAchieved}`, { usn: existingDevice.usn });
          } else {
            logger.warn(`_handleSsdpMessage: Failed to get updated description for existing device: ${existingDevice.usn} from location ${basicDevice.location}`, { usn: existingDevice.usn });
          }
        } catch (error) {
          logger.error(`_handleSsdpMessage: Error processing device description update for existing device ${existingDevice.usn}: ${error instanceof Error ? error.message : String(error)}`, { usn: existingDevice.usn, location: basicDevice.location, error });
        }
      }

      this.activeDevices.set(existingDevice.usn, existingDevice);
      this.emit('deviceupdated', existingDevice.usn, existingDevice);
      logger.debug(`_handleSsdpMessage: Device updated: ${existingDevice.usn}`, { usn: existingDevice.usn, detailLevelUpdated });

    } else {
      // מכשיר חדש
      if (!basicDevice.location) {
        // זה לא אמור לקרות כי בדקנו location למעלה עבור הודעות שאינן byebye
        logger.error('_handleSsdpMessage: Trying to process new device without location. This should not happen.', { usn: basicDevice.usn });
        return;
      }

      logger.debug(`_handleSsdpMessage: Attempting to process new device: ${basicDevice.usn} at ${basicDevice.location}`, { requestedDetailLevel: this.options.detailLevel });
      try {
        const processedData = await processUpnpDevice(basicDevice, this.options.detailLevel);
        if (processedData) {
          // processedData הוא ProcessedDevice. ApiDevice מרחיב את FullDeviceDescription.
          // נצטרך למפות את השדות בזהירות.
          const newApiDevice: ApiDevice = {
            // שדות מ-BasicSsdpDevice
            usn: basicDevice.usn, // שימוש ישיר ב-basicDevice.usn כדי להיות בטוח
            location: processedData.location || basicDevice.location || '', // ודא ש-location הוא מחרוזת
            server: processedData.server || '',
            st: processedData.st,
            remoteAddress: processedData.remoteAddress,
            remotePort: processedData.remotePort,
            headers: processedData.headers,
            timestamp: processedData.timestamp,
            messageType: processedData.messageType,
            httpMethod: processedData.httpMethod,
            httpStatusCode: processedData.httpStatusCode,
            httpStatusMessage: processedData.httpStatusMessage,
            cacheControlMaxAge: processedData.cacheControlMaxAge,
            nts: processedData.nts,
            httpVersion: processedData.httpVersion,

            // שדות מ-DeviceDescription (קיימים אם detailLevelAchieved >= Description)
            // יש לספק ערכי ברירת מחדל אם processedData הוא רק BasicSsdpDevice
            deviceType: (processedData as DeviceDescription).deviceType || basicDevice.st,
            friendlyName: (processedData as DeviceDescription).friendlyName || basicDevice.usn,
            manufacturer: (processedData as DeviceDescription).manufacturer || '',
            manufacturerURL: (processedData as DeviceDescription).manufacturerURL,
            modelDescription: (processedData as DeviceDescription).modelDescription,
            modelName: (processedData as DeviceDescription).modelName || '',
            modelNumber: (processedData as DeviceDescription).modelNumber,
            modelURL: (processedData as DeviceDescription).modelURL,
            serialNumber: (processedData as DeviceDescription).serialNumber,
            UDN: (processedData as DeviceDescription).UDN || basicDevice.usn.split('::')[0],
            presentationURL: (processedData as DeviceDescription).presentationURL,
            iconList: (processedData as DeviceDescription).iconList || [],
            serviceList: (processedData as DeviceDescription).serviceList || new Map(),
            deviceList: (processedData as DeviceDescription).deviceList, // יכול להיות undefined
            baseURL: (processedData as DeviceDescription).baseURL,
            URLBase: (processedData as DeviceDescription).URLBase,
            UPC: (processedData as DeviceDescription).UPC,

            // שדות מ-ApiDevice
            lastSeen: Date.now(),
            expiresAt,
            detailLevelAchieved: processedData.detailLevelAchieved || DiscoveryDetailLevel.Basic,
          };
          logger.debug(`_handleSsdpMessage: Created newApiDevice for USN '${newApiDevice.usn}': friendlyName='${newApiDevice.friendlyName}', UDN='${newApiDevice.UDN}'`);
          this.activeDevices.set(newApiDevice.usn, newApiDevice);
          this.emit('devicefound', newApiDevice.usn, newApiDevice);
          // שינוי הלוג לפורמט זהה ללוג הדיבאג הקודם לו
          logger.info(`_handleSsdpMessage: (INFO) Processed newApiDevice for USN '${newApiDevice.usn}': friendlyName='${newApiDevice.friendlyName}', UDN='${newApiDevice.UDN}', detailLevel='${newApiDevice.detailLevelAchieved}'`);
        } else {
          // אם לא הצלחנו לקבל תיאור מלא, ורמת הפירוט המבוקשת היא רק Basic,
          // אז basicDevice עצמו מספיק כדי ליצור ApiDevice בסיסי.
          if (this.options.detailLevel === DiscoveryDetailLevel.Basic) {
            const basicApiDevice: ApiDevice = {
              ...basicDevice, // כל השדות מ-BasicSsdpDevice
              // שדות חובה מ-DeviceDescription שצריך לספק להם ערכי ברירת מחדל
              deviceType: basicDevice.st,
              friendlyName: basicDevice.usn,
              manufacturer: '', // ערך ברירת מחדל
              modelName: '', // ערך ברירת מחדל
              UDN: basicDevice.usn.split('::')[0], // ברירת מחדל
              iconList: [],
              serviceList: new Map(),
              // שדות מ-ApiDevice
              lastSeen: Date.now(),
              expiresAt,
              detailLevelAchieved: DiscoveryDetailLevel.Basic,
            };
            logger.debug(`_handleSsdpMessage: Created basicApiDevice for USN '${basicApiDevice.usn}': friendlyName='${basicApiDevice.friendlyName}', UDN='${basicApiDevice.UDN}'`);
            this.activeDevices.set(basicApiDevice.usn, basicApiDevice);
            this.emit('devicefound', basicApiDevice.usn, basicApiDevice);
            // שינוי הלוג לפורמט זהה ללוג הדיבאג הקודם לו
            logger.info(`_handleSsdpMessage: (INFO) Processed basicApiDevice for USN '${basicApiDevice.usn}': friendlyName='${basicApiDevice.friendlyName}', UDN='${basicApiDevice.UDN}', detailLevel='${basicApiDevice.detailLevelAchieved}'`);
          } else {
            logger.warn(`_handleSsdpMessage: Failed to get sufficient description for new device: ${basicDevice.usn} at ${basicDevice.location} (requested level: ${this.options.detailLevel}). Device not added.`, { usn: basicDevice.usn });
          }
        }
      } catch (error) {
        logger.error(`_handleSsdpMessage: Error processing device description for new device ${basicDevice.usn}: ${error instanceof Error ? error.message : String(error)}`, { usn: basicDevice.usn, location: basicDevice.location, error });
      }
    }
  }

  /**
   * @hebrew מסיר מכשירים שפג תוקפם מרשימת המכשירים הפעילים.
   * מתודה זו נקראת באופן תקופתי.
   */
  private _cleanupDevices(): void {
    const now = Date.now();
    logger.debug(`_cleanupDevices: Starting cleanup. Current active devices: ${this.activeDevices.size}`);

    for (const [usn, device] of this.activeDevices.entries()) {
      if (device.expiresAt < now) {
        this.activeDevices.delete(usn);
        // חשוב: האירוע 'devicelost' מצפה לקבל את ה-USN ואת אובייקט ה-ApiDevice
        this.emit('devicelost', usn, device);
        logger.info(`_cleanupDevices: Removed expired device: ${usn} (FriendlyName: ${device.friendlyName}, ExpiresAt: ${new Date(device.expiresAt).toISOString()})`, { usn, friendlyName: device.friendlyName });
      }
    }
    logger.debug(`_cleanupDevices: Finished cleanup. Active devices after cleanup: ${this.activeDevices.size}`);
  }

  /**
   * @hebrew מתחיל את תהליך גילוי המכשירים.
   * מאתחל סוקטים, שולח M-SEARCH ראשוני ומפעיל טיימרים תקופתיים.
   * @returns Promise<void>
   */
  public async start(): Promise<void> {
    logger.info('Attempting to start ActiveDeviceManager...');
    if (this.isRunning) {
      logger.warn('ActiveDeviceManager is already running. Start request ignored.');
      return Promise.resolve();
    }

    try {
      // אתחול socketManager
      logger.debug('Creating socket manager...');

      let networkInterfacesArg: NodeJS.Dict<os.NetworkInterfaceInfo[]> | undefined = undefined;
      if (this.options.networkInterfaces && this.options.networkInterfaces.length > 0) {
        if (typeof this.options.networkInterfaces[0] === 'string') {
          // Case: string[] - filter os.networkInterfaces()
          const selectedInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {};
          const allOsInterfaces = os.networkInterfaces();
          (this.options.networkInterfaces as string[]).forEach(name => {
            if (allOsInterfaces[name]) {
              selectedInterfaces[name] = allOsInterfaces[name]!;
            }
          });
          if (Object.keys(selectedInterfaces).length > 0) {
            networkInterfacesArg = selectedInterfaces;
          }
        } else if (typeof this.options.networkInterfaces === 'object' && !Array.isArray(this.options.networkInterfaces)) {
          // Case: NodeJS.Dict<os.NetworkInterfaceInfo[]> - use directly
          // We need to ensure it's not an empty array that was cast to object
          if (Object.keys(this.options.networkInterfaces).length > 0) {
            networkInterfacesArg = this.options.networkInterfaces as NodeJS.Dict<os.NetworkInterfaceInfo[]>;
          }
        }
      }

      this.socketManager = await createSocketManager(
        { // Options for createSocketManager
          includeIPv6: this.options.includeIPv6,
        },
        // onMessage callback
        (msg: Buffer, rinfo: RemoteInfo, socketType: string) => {
          // טיפול ב-onRawSsdpMessage אם סופק
          if (this.options.onRawSsdpMessage && typeof this.options.onRawSsdpMessage === 'function') {
            try {
              // ודא שהקריאה תואמת לחתימה של RawSsdpMessageHandler
              this.options.onRawSsdpMessage({ message: msg, remoteInfo: rinfo, socketType: socketType });
            } catch (rawCbError: any) {
              logger.error('Error in user-provided onRawSsdpMessage callback:', rawCbError);
            }
          }
          // קריאה ל-handler הפנימי
          this._handleSsdpMessage(msg, rinfo, socketType).catch((err: Error) => {
            logger.error(`Error in _handleSsdpMessage for socketType ${socketType}:`, err);
          });
        },
        // onError callback
        (err: Error, socketType: string) => {
          logger.error(`Socket error on ${socketType}:`, err);
          this.emit('error', err); // פליטת אירוע שגיאה מהמחלקה
        },
        // networkInterfaces (optional)
        networkInterfacesArg
      );
      logger.info('Socket manager created successfully.');

      // שליחת M-SEARCH ראשוני
      if (this.socketManager) {
        logger.debug(`Sending initial M-SEARCH for target: ${this.options.searchTarget}`);
        // נשלח גם ל-IPv4 וגם ל-IPv6 אם רלוונטי
        this.socketManager.sendMSearch(this.options.searchTarget, 4).catch((err: Error) => {
          logger.error('Error sending initial M-SEARCH IPv4:', err);
        });
        if (this.options.includeIPv6) {
          this.socketManager.sendMSearch(this.options.searchTarget, 6).catch((err: Error) => {
            logger.error('Error sending initial M-SEARCH IPv6:', err);
          });
        }
      } else {
        logger.error('Socket manager not initialized, cannot send initial M-SEARCH.');
        // במקרה כזה, סביר להניח ש-createSocketManager נכשל והשגיאה כבר טופלה/נפלטה.
        // אולי נרצה לזרוק שגיאה כאן כדי לעצור את תהליך ה-start.
        throw new Error('Socket manager initialization failed.');
      }

      // הפעלת setInterval ל-M-SEARCH תקופתי
      if (this.mSearchIntervalId) {
        clearInterval(this.mSearchIntervalId);
      }
      this.mSearchIntervalId = setInterval(() => {
        if (this.socketManager && this.isRunning) {
          logger.debug(`Sending periodic M-SEARCH for target: ${this.options.searchTarget}`);
          this.socketManager.sendMSearch(this.options.searchTarget, 4).catch((err: Error) => {
            logger.error('Error sending periodic M-SEARCH IPv4:', err);
          });
          if (this.options.includeIPv6) {
            this.socketManager.sendMSearch(this.options.searchTarget, 6).catch((err: Error) => {
              logger.error('Error sending periodic M-SEARCH IPv6:', err);
            });
          }
        }
      }, this.options.mSearchIntervalMs);
      logger.info(`Periodic M-SEARCH interval set for ${this.options.mSearchIntervalMs}ms.`);

      // הפעלת setInterval ל-_cleanupDevices
      if (this.cleanupIntervalId) {
        clearInterval(this.cleanupIntervalId);
      }
      this.cleanupIntervalId = setInterval(() => {
        if (this.isRunning) {
          this._cleanupDevices();
        }
      }, this.options.deviceCleanupIntervalMs);
      logger.info(`Device cleanup interval set for ${this.options.deviceCleanupIntervalMs}ms.`);

      // עדכון מצב ופליטת אירוע
      this.isRunning = true;
      this.emit('started');
      logger.info('ActiveDeviceManager started successfully.');

    } catch (error) {
      logger.error('Failed to start ActiveDeviceManager:', error);
      this.isRunning = false; // ודא שהמצב נשאר false אם ההתחלה נכשלה
      // אם socketManager נוצר חלקית, נסגור אותו
      if (this.socketManager) {
        this.socketManager.closeAll().catch((closeErr: any) => {
          logger.error('Error closing socket manager during failed start:', closeErr);
        });
        this.socketManager = null;
      }
      // נקה אינטרוולים אם נוצרו
      if (this.mSearchIntervalId) {
        clearInterval(this.mSearchIntervalId);
        this.mSearchIntervalId = null;
      }
      if (this.cleanupIntervalId) {
        clearInterval(this.cleanupIntervalId);
        this.cleanupIntervalId = null;
      }
      // פליטת שגיאה או זריקה מחדש כדי שהקוד הקורא ידע על הכשל
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      // אין צורך לזרוק מחדש אם פולטים אירוע, אלא אם כן החוזה של הפונקציה דורש זאת.
      // כאן, מכיוון שהפונקציה מחזירה Promise<void>, פליטת אירוע מספיקה.
      // אם רוצים שה-Promise ידחה, יש להשתמש ב-return Promise.reject(error);
      return Promise.reject(error);
    }
  }

  /**
     * @hebrew מחזירה עותק של רשימת המכשירים הפעילים שזוהו.
     * @returns Map&lt;string, ApiDevice&gt; - מפה של המכשירים הפעילים.
     */
  public getActiveDevices(): Map<string, ApiDevice> {
    // החזרת עותק של המפה כדי למנוע שינויים חיצוניים ישירים
    return new Map(this.activeDevices);
  }
  /**
   * @hebrew עוצר את תהליך גילוי המכשירים.
   * מנקה טיימרים, סוגר סוקטים ומנקה את רשימת המכשירים.
   * @returns Promise<void>
   */
  public async stop(): Promise<void> {
    logger.info('Attempting to stop ActiveDeviceManager...');
    if (!this.isRunning) {
      logger.warn('ActiveDeviceManager is not running. Stop request ignored.');
      return Promise.resolve();
    }

    // ניקוי אינטרוולים
    if (this.mSearchIntervalId) {
      clearInterval(this.mSearchIntervalId);
      this.mSearchIntervalId = null;
      logger.debug('M-SEARCH interval cleared.');
    }
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      logger.debug('Cleanup interval cleared.');
    }

    // סגירת socketManager
    if (this.socketManager) {
      try {
        logger.debug('Closing socket manager...');
        // המתודה ב-ssdpSocketManager נקראת closeAll
        await this.socketManager.closeAll();
        logger.info('Socket manager closed successfully.');
      } catch (error) {
        logger.error('Error closing socket manager:', error);
        // נמשיך בתהליך העצירה גם אם יש שגיאה בסגירת הסוקטים
      } finally {
        this.socketManager = null;
      }
    }

    // ניקוי activeDevices
    this.activeDevices.clear();
    logger.debug('Active devices list cleared.');

    // עדכון מצב ופליטת אירוע
    this.isRunning = false;
    this.emit('stopped');
    logger.info('ActiveDeviceManager stopped successfully.');
    return Promise.resolve();
  }

  // כאן יתווספו מתודות נוספות בהמשך
}