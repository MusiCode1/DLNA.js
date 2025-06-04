import { createModuleLogger, type DeviceDescription, type DeviceWithServicesDescription, type FullDeviceDescription, type ProcessedDevice, type RawSsdpMessagePayload } from 'dlna.js';
import type { RemoteInfo } from 'node:dgram';
import { ContinuousDeviceExplorer } from './continuousDeviceExplorer';
import type { ApiDevice } from './types';
import { DEFAULT_DISCOVERY_OPTIONS, MAX_RAW_MESSAGES, DEVICE_CLEANUP_INTERVAL_MS, MAX_DEVICE_INACTIVITY_MS } from './config';

const logger = createModuleLogger('DeviceManager');

// מאגר לאחסון הודעות SSDP גולמיות
interface RawMessagesBufferEntry {
  message: string; // ההודעה כטקסט
  remoteInfo: RemoteInfo; // מידע על השולח
  socketType: string; // סוג הסוקט (unicast/multicast)
}
const rawMessagesBuffer: RawMessagesBufferEntry[] = [];

// מפה לאחסון המכשירים הפעילים שנתגלו
const activeDevices: Map<string, ApiDevice> = new Map();

const deviceExplorer = new ContinuousDeviceExplorer(DEFAULT_DISCOVERY_OPTIONS);

/**
 * @hebrew מעדכן את רשימת המכשירים הפעילים עם המידע שהתקבל.
 * @param deviceData - המידע על המכשיר שנתגלה או עודכן.
 */
export function updateDeviceList(deviceData: DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription): void {
  if (deviceData.friendlyName && deviceData.modelName && deviceData.UDN) {
    let iconUrl: string | undefined = undefined;
    if (deviceData.iconList && deviceData.iconList.length > 0 && deviceData.baseURL) {
      const firstIcon = deviceData.iconList[0];
      if (firstIcon && firstIcon.url) {
        try {
          iconUrl = new URL(firstIcon.url, deviceData.baseURL).href;
        } catch (e) {
          logger.warn(`Could not construct icon URL for device ${deviceData.UDN}: ${firstIcon.url}, base: ${deviceData.baseURL}`, e);
        }
      }
    }

    const supportedServices: string[] = deviceData.serviceList
      ? deviceData.serviceList.map(service => service.serviceType).filter(st => !!st) as string[]
      : [];

    const apiDevice: ApiDevice = {
      friendlyName: deviceData.friendlyName,
      modelName: deviceData.modelName,
      udn: deviceData.UDN,
      remoteAddress: deviceData.remoteAddress,
      lastSeen: Date.now(),
      iconUrl: iconUrl,
      baseURL: deviceData.baseURL,
      serviceList: deviceData.serviceList,
      supportedServices: supportedServices,
      presentationURL: deviceData.presentationURL,
      rootDoc: deviceData.location // 'location' הוא השדה המקורי מה-XML שמתאר את מיקום ה-root description
    };
    activeDevices.set(apiDevice.udn, apiDevice);
    logger.info(`Device updated/added: ${apiDevice.friendlyName} (UDN: ${apiDevice.udn})${apiDevice.iconUrl ? ` Icon: ${apiDevice.iconUrl}` : ''}, BaseURL: ${apiDevice.baseURL}, PresentationURL: ${apiDevice.presentationURL || 'N/A'}, Services: ${supportedServices.length > 0 ? supportedServices.join(', ') : 'N/A'}`);
  } else {
    logger.warn('Received device data without all required fields (friendlyName, modelName, UDN)', { udn: deviceData.UDN });
  }
}

/**
 * @hebrew מתחיל את תהליך גילוי המכשירים הרציף.
 */
export function startDiscovery(): void {
  logger.info('Initializing continuous UPnP device discovery process...');

  deviceExplorer.on('device', (device: ProcessedDevice) => {
    if ('UDN' in device) {
      updateDeviceList(device as DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription);
    } else {
      logger.debug('Received basic device without full details, UDN from USN (if available):', device.usn);
    }
  });

  deviceExplorer.on('rawResponse', (payload: RawSsdpMessagePayload) => {
    const messageString = payload.message.toString('utf-8');
    rawMessagesBuffer.push({
      message: messageString,
      remoteInfo: payload.remoteInfo,
      socketType: payload.socketType,
    });
    if (rawMessagesBuffer.length > MAX_RAW_MESSAGES) {
      rawMessagesBuffer.shift();
    }
  });

  deviceExplorer.on('error', (err: Error) => {
    logger.error('Error during continuous device discovery:', err);
  });

  deviceExplorer.on('stopped', () => {
    logger.info('Continuous device discovery process has stopped.');
  });

  deviceExplorer.startDiscovery();
}

/**
 * @hebrew מפסיק את תהליך גילוי המכשירים הרציף.
 */
export function stopDiscovery(): void {
  logger.info('Stopping UPnP device discovery...');
  deviceExplorer.stopDiscovery();
}

/**
 * @hebrew מחזיר את רשימת המכשירים הפעילים הנוכחית.
 * @returns {Map<string, ApiDevice>} מפה של המכשירים הפעילים.
 */
export function getActiveDevices(): Map<string, ApiDevice> {
  return activeDevices;
}

/**
 * @hebrew מחזיר את מאגר ההודעות הגולמיות.
 * @returns {RawMessagesBufferEntry[]} מערך של הודעות גולמיות.
 */
export function getRawMessagesBuffer(): RawMessagesBufferEntry[] {
  return rawMessagesBuffer;
}

// ניקוי תקופתי של מכשירים שלא נראו לאחרונה
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [udn, device] of activeDevices.entries()) {
    if (now - device.lastSeen > MAX_DEVICE_INACTIVITY_MS) {
      activeDevices.delete(udn);
      cleanedCount++;
      logger.info(`Removed inactive device: ${device.friendlyName} (UDN: ${udn})`);
    }
  }
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} inactive devices.`);
  }
}, DEVICE_CLEANUP_INTERVAL_MS);