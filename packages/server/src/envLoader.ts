import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs'; // נייבא fs כדי לבדוק קיום קבצים

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