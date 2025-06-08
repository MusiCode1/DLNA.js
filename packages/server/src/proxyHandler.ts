import type { Request, Response, NextFunction } from 'express';
import { createLogger } from 'dlna.js';
import { getActiveDevices } from './deviceManager';

const logger = createLogger('ProxyHandler');

/**
 * מטפל בבקשות פרוקסי למשאבים של מכשירים.
 * מחלץ את מזהה המכשיר והנתיב מהבקשה, מאתר את כתובת ה-URL הבסיסית של המכשיר,
 * ומעביר את הבקשה למכשיר. התשובה מהמכשיר מועברת חזרה לקליינט המקורי.
 *
 * @param req - אובייקט הבקשה של Express.
 * @param res - אובייקט התשובה של Express.
 * @param next - פונקציית ה-middleware הבאה של Express.
 */
export async function proxyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  
  const currentActiveDevices = getActiveDevices();
  const { deviceId, resourcePath } = req.params;

  if (!deviceId || !resourcePath) {
    logger.warn('Bad request: Device ID or resource path is missing.');
    res.status(400).send('Device ID and resource path are required.');
    return;
  }

  logger.info(`Proxy request for deviceId: "${deviceId}", path: "${resourcePath}"`);

  try {
    const device = currentActiveDevices.get(deviceId);

    if (!device) {
      logger.warn(`Device with ID "${deviceId}" not found.`);
      res.status(404).send(`Device with ID "${deviceId}" not found.`);
      return;
    }

    const { baseURL } = device;
    if (!baseURL) {
      logger.error(`Device with ID "${deviceId}" does not have a baseURL.`);
      res.status(404).send(`Device with ID "${deviceId}" does not have a baseURL.`);
      return;
    }

    // הרכבת כתובת ה-URL המלאה למשאב
    const targetUrl = new URL(resourcePath, baseURL).toString();
    logger.info(`Forwarding request to: ${targetUrl}`);

    const deviceResponse = await fetch(targetUrl);

    // העברת ה-headers מהתשובה של המכשיר לתשובה שלנו
    deviceResponse.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });

    // העברת ה-status code
    res.status(deviceResponse.status);

    // קריאת גוף התשובה כ-ArrayBuffer והעברתו
    const body = await deviceResponse.arrayBuffer();
    res.send(Buffer.from(body));

  } catch (error) {
    logger.error(`Proxy error for device "${deviceId}" and path "${resourcePath}":`, error);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway: Error fetching resource from device.');
    }
  }
}
