import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs'; // נייבא fs כדי לבדוק קיום קבצים
import * as url from "url";

if (!__dirname) {
  // @ts-ignore
  const filePathUrl = import.meta.url; // המרת import.meta.url לנתיב קובץ רגיל
  const filePath = url.fileURLToPath(filePathUrl); // המרת URL לקובץ לנתיב קובץ רגיל
  
  const dirname = path.dirname(filePath); 
  __dirname = dirname; 
}

// נתיב לקובץ .env בספריית האב של הפרויקט (השורש)
const parentEnvPath = path.resolve(__dirname, '../../../.env');

// נתיב לקובץ .env מקומי, בתוך חבילת השרת
const localEnvPath = path.resolve(__dirname, '../.env'); // כלומר, packages/server/.env

// פונקציה לטעינה בטוחה של קובץ .env
const loadEnvFile = (filePath: string, override: boolean = false) => {
  if (fs.existsSync(filePath)) {
    const result = dotenv.config({ path: filePath, override });
    if (result.error) {
      console.warn(`[EnvLoader] Error loading .env file from ${filePath}:`, result.error.message);
    } else {
      // console.log(`[EnvLoader] Successfully loaded .env file from ${filePath}. Override: ${override}`);
      // if (result.parsed) {
      //   console.log('[EnvLoader] Variables loaded:', Object.keys(result.parsed).join(', '));
      // }
    }
  } else {
    // console.log(`[EnvLoader] .env file not found at ${filePath}. Skipping.`);
  }
};

// 1. טען את קובץ ה-.env מספריית האב (אם קיים)
//    ערכים מקובץ זה לא יידרסו על ידי קריאות dotenv.config() עתידיות אלא אם כן override:true מצוין בהן.
//    כאן אנחנו לא משתמשים ב-override כי זה הבסיס.
loadEnvFile(parentEnvPath);

// 2. טען את קובץ ה-.env המקומי (בתוך packages/server/.env, אם קיים)
//    עם override: true כדי שערכים מקובץ זה ידרסו ערכים זהים שנטענו מהקובץ הגלובלי.
loadEnvFile(localEnvPath, true);

// console.log('[EnvLoader] Environment variables loading process completed.');
// console.log(`[EnvLoader] Current NODE_ENV: ${process.env.NODE_ENV}`);
// console.log(`[EnvLoader] Current LOGTAIL_SOURCE_TOKEN: ${process.env.LOGTAIL_SOURCE_TOKEN ? 'SET' : 'NOT SET'}`);
/**
 * בודק אם מחרוזת ניתנת להמרה למספר ללא איבוד מידע.
 * 
 * הפונקציה מוודאת שהמחרוזת מייצגת מספר סופי (לא NaN או Infinity),
 * שההמרה לא גרמה לאיבוד דיוק (במספרים גדולים),
 * ומתייחסת נכון לייצוגים שונים של אותו מספר (למשל "1" ו-"1.0").
 *
 * @param value - הערך לבדיקה.
 * @returns {boolean} - אמת אם ההמרה אפשרית ללא איבוד מידע, אחרת שקר.
 */
function isStringLosslesslyNumeric(value: any): boolean {
    // בדיקה ראשונית - null, undefined, או מחרוזת ריקה אינם מספרים.
    if (value == null || typeof value !== 'string' || value.trim() === '') {
        return false;
    }

    const num = Number(value);

    // בדיקה שהתוצאה היא מספר סופי (לא NaN, Infinity, or -Infinity)
    if (!isFinite(num)) {
        return false;
    }

    // התנאי המרכזי:
    // 1. `String(num) === value`: בודק אם ההמרה חזרה למחרוזת זהה למקור.
    // 2. `num === parseFloat(value)`: בודק אם הערכים המספריים זהים.
    return String(num) === value || num === parseFloat(value);
}

/**
 * מעבד את כל משתני הסביבה ב-process.env,
 * וממיר ערכים מספריים למספרים (שלם או צף).
 * @returns {Record<string, string | number | undefined>} - אובייקט חדש עם הערכים המעובדים.
 */
const getProcessedEnv = (): Record<string, string | number | undefined> => {
    const processed: Record<string, string | number | undefined> = {};
    const envSnapshot = { ...process.env };

    for (const key in envSnapshot) {
        const value = envSnapshot[key];
        if (isStringLosslesslyNumeric(value)) {
            processed[key] = Number(value);
        } else {
            processed[key] = value;
        }
    }
    return processed;
};

/**
 * אובייקט המכיל את משתני הסביבה לאחר טעינה ועיבוד.
 * ערכים שניתן להמיר למספר ללא איבוד מידע יומרו.
 * יש לייבא את האובייקט הזה במקום לגשת ישירות ל-process.env.
 */
export const env = getProcessedEnv();