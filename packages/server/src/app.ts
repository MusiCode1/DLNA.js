import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as url from "url";
import { createModuleLogger } from 'dlna.js';
import { config } from './config';
import apiRouter from './routes'; // ייבוא ה-router הראשי
import { startDiscovery as startDeviceDiscovery } from './deviceManager'; // שינוי שם הייבוא למניעת התנגשות פוטנציאלית

if (!__dirname) {
  // @ts-ignore
  const filePathUrl = import.meta.url; // המרת import.meta.url לנתיב קובץ רגיל
  const filePath = url.fileURLToPath(filePathUrl); // המרת URL לקובץ לנתיב קובץ רגיל

  const dirname = path.dirname(filePath);
  __dirname = dirname;
}

const logger = createModuleLogger('AppServer'); // לוגר ספציפי לקובץ זה

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// הגשת קבצים סטטיים מהתיקייה public
// ודא שהנתיב לתיקיית public נכון ביחס למיקום קובץ השרת
// בהנחה שהקוד המקומפל יהיה ב-dist, והקובץ app.js יהיה ב-dist/app.js
// אז __dirname יצביע ל-dist. לכן, נתיב ל-public צריך להיות '../public'
// או אם public נמצאת ברמה של src/dist, אז path.join(__dirname, '..', 'public')
// כרגע, בהנחה ש-public נמצאת ברמה של packages/server/public
const publicPathDirectory = path.join(__dirname, '..', 'public');
logger.info(`Serving static files from: ${publicPathDirectory}`);
app.use(express.static(publicPathDirectory));

// שימוש ב-router הראשי שהגדרנו
app.use(apiRouter);

// Error handling middleware - חייב להיות האחרון
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('An error occurred in an Express handler:', err);

  // אם השגיאה מכילה statusCode, נשתמש בו. אחרת, 500.
  const statusCode = (err as any).statusCode || 500;
  const message = (err as any).customMessage || err.message || "Internal Server Error";

  // הימנעות מחשיפת פרטי שגיאה רגישים בסביבת ייצור
  // בייצור, אולי נרצה להחזיר רק הודעה גנרית עבור שגיאות 500.
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    res.status(500).json({ error: "Internal Server Error" });
  } else {
    res.status(statusCode).json({ error: message, details: err.stack }); // אפשר להוסיף details רק בפיתוח
  }
});

export function startServer(): void {
  try {

    app.listen(Number(config.server.port), () => {
      logger.info(`Server listening on port ${config.server.port}`);
      logger.info(`Access the UI at: http://localhost:${config.server.port}/`); // שינוי קל בהודעה
      // התחל את גילוי המכשירים לאחר שהשרת התחיל להאזין
      startDeviceDiscovery();
    });

  } catch (error) {
    logger.error('Error starting the server:', error);
    
  }
}

export default app; // ייצוא האפליקציה לבדיקות או שימושים אחרים אם נדרש