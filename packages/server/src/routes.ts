import { Router, Request, Response, NextFunction } from 'express';
import { getActiveDevices, getRawMessagesBuffer } from './deviceManager'; // updateDeviceList הוסר
import { handleBrowseRequest } from './browseHandler';
import { createRendererHandler } from './rendererHandler';
import {
  handleGetPresets,
  handlePostPreset,
  handleDeletePreset,
  handleWakePreset,
  // handlePlayPresetByQuery, // הוסר כי משתמשים רק ב-path parameter
  handlePlayPresetByParam
} from './presetManager';

const router = Router();

// Device routes
router.get('/api/devices', (req: Request, res: Response) => {
  const activeDevicesMap = getActiveDevices();
  const devicesArray = Array.from(activeDevicesMap.values());

  // לוג לבדיקה
  console.log(`[/api/devices] Found ${activeDevicesMap.size} active devices in map.`);
  devicesArray.forEach((device, index) => {
    console.log(`[/api/devices] Device ${index} from array: USN='${device.usn}', UDN='${device.UDN}', FriendlyName='${device.friendlyName}'`);
  });

  // יצירת מערך חדש עם אובייקטים "שטוחים" עבור ה-JSON
  const plainDevicesArray = devicesArray.map(device => ({
    usn: device.usn, // השדה הבעייתי
    UDN: device.UDN,
    friendlyName: device.friendlyName,
    location: device.location,
    server: device.server,
    st: device.st,
    remoteAddress: device.remoteAddress,
    remotePort: device.remotePort,
    baseURL: device.baseURL,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    deviceType: device.deviceType,
    presentationURL: device.presentationURL,
    iconList: device.iconList,
    // הוספת serviceList כאובייקט רגיל
    serviceList: device.serviceList ? Object.fromEntries(device.serviceList) : {},
    lastSeen: device.lastSeen,
    expiresAt: device.expiresAt,
    detailLevelAchieved: device.detailLevelAchieved,
  }));
  
  console.log('[/api/devices] plainDevicesArray for JSON:', JSON.stringify(plainDevicesArray, null, 2));
  res.json(plainDevicesArray);
});

router.post('/api/devices/:udn/browse', (req: Request, res: Response, next: NextFunction) => {
  handleBrowseRequest(req, res, next, getActiveDevices());
});

// Raw messages route
router.get('/api/raw-messages', (req: Request, res: Response) => {
  res.json(getRawMessagesBuffer());
});

// Renderer routes
const rendererRouter = createRendererHandler(getActiveDevices());
router.use('/api/renderers', rendererRouter);

// Preset routes
router.get('/api/presets', handleGetPresets);
router.post('/api/presets', handlePostPreset);
router.delete('/api/presets', handleDeletePreset);

// WOL for preset route
router.post('/api/wol/wake/:presetName', handleWakePreset);

// Play preset route (using path parameter)
// שים לב: updateDeviceList מועברת כאן. זו הפונקציה המיוצאת מ-deviceManager.
router.get('/api/play-preset/:presetName', (req: Request, res: Response, next: NextFunction) => {
  handlePlayPresetByParam(req, res, next, getActiveDevices()); // updateDeviceList הוסר
});

export default router;