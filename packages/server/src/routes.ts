import { Router, Request, Response, NextFunction } from 'express';
import { getActiveDevices, getRawMessagesBuffer } from './deviceManager'; // updateDeviceList הוסר
import { handleBrowseRequest } from './browseHandler';
import { proxyHandler } from './proxyHandler';
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

import {
  invokeDeviceAction,
  DeviceNotFound,
  ServiceNotFound,
  ActionNotFound,
  ActionFailed,
} from './deviceActionService';

const router = Router();

try {



  // Device routes
  router.get('/api/devices', (req: Request, res: Response) => {

    const activeDevicesMap = getActiveDevices();

    const devicesArray = Array.from(activeDevicesMap.values());

    const jsonString = JSON.stringify(devicesArray, customJsonReplacer);

    res.type('application/json').send(jsonString);
  });

  const deviceActionHandler = async (req: Request, res: Response, next: NextFunction) => {
    const { udn } = req.params;
    const { serviceId, actionName, args } = req.body;

    if (!serviceId || !actionName) {
      return res.status(400).json({ success: false, error: 'serviceId and actionName are required' });
    }

    try {
      const result = await invokeDeviceAction(
        getActiveDevices(),
        udn,
        serviceId,
        actionName,
        args
      );
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      let statusCode = 500;
      if (error instanceof DeviceNotFound || error instanceof ServiceNotFound || error instanceof ActionNotFound) {
        statusCode = 404;
      } else if (error instanceof ActionFailed) {
        statusCode = 502; // Bad Gateway, as the error is from an upstream server (the DLNA device)
      }
      res.status(statusCode).json({ success: false, error: error.message });
    }
  }

  router.post('/api/devices/:udn/action', (req, res, next) => {
    deviceActionHandler(req, res, next);
  });

  router.post('/api/devices/:udn/browse', (req, res: Response, next: NextFunction) => {
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

  // Proxy route
  router.get(/\/proxy\/(.+?)\/(.*)/, proxyHandler);

} catch (error) {

  console.error(error)

  throw error;
}

export default router;