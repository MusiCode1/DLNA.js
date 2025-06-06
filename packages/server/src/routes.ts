import { Router, Request, Response, NextFunction } from 'express';
import { getActiveDevices, getRawMessagesBuffer } from './deviceManager'; // updateDeviceList הוסר
import { handleBrowseRequest } from './browseHandler';
import { createRendererHandler } from './rendererHandler';
import { customJsonReplacer } from './customSerializer'; // ייבוא הפונקציה החדשה
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

  const jsonString = JSON.stringify(devicesArray, customJsonReplacer);

  res.type('application/json').send(jsonString);
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