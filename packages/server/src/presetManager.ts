// קובץ זה מכיל פונקציות לניהול הגדרות הפריסטים
import * as fs from 'fs/promises';
import * as path from 'path';
import { AllPresetSettings, PresetSettings, PresetEntry } from './types'; // ייבוא הטיפוסים הרלוונטיים, כולל PresetEntry

const PRESETS_FILE_PATH = path.join(__dirname, 'presets.json'); // שימוש בשם ובמיקום מהמשימה

/**
 * @hebrew טוען את הגדרות הפריסט מקובץ ה-JSON וממיר אותן למערך.
 * @returns {Promise<AllPresetSettings>} אובייקט של כל הפריסטים. אם הקובץ לא קיים או לא תקין, מחזיר אובייקט ריק.
 */
export async function loadPresets(): Promise<AllPresetSettings> {
    try {
        // בדיקה אם הקובץ קיים
        await fs.access(PRESETS_FILE_PATH);
        const data = await fs.readFile(PRESETS_FILE_PATH, 'utf-8');
        if (!data.trim()) {
            // אם הקובץ ריק, החזר אובייקט ריק
            return {};
        }
        // ניתוח ה-JSON
        const presetsObject = JSON.parse(data) as AllPresetSettings;
        return presetsObject;
    } catch (error: any) {
        // אם הקובץ לא קיים (ENOENT) או שיש שגיאה אחרת בקריאה/ניתוח, החזר אובייקט ריק
        if (error.code === 'ENOENT') {
            // אם הקובץ לא קיים, ניצור אותו עם אובייקט ריק בפעם הבאה שישמרו הגדרות
            // או שנחזיר אובייקט ריק כפי שנדרש
            return {};
        }
        console.error('Error loading presets:', error);
        // במקרה של שגיאת JSON או שגיאה אחרת, החזר אובייקט ריק כדי למנוע קריסה
        return {};
    }
}

/**
 * @hebrew שומר את כלל הגדרות הפריסט הנתונות לקובץ ה-JSON.
 * @param {AllPresetSettings} settings - אובייקט כלל ההגדרות לשמירה.
 * @returns {Promise<void>}
 */
export async function savePresets(settings: AllPresetSettings): Promise<void> {
    try {
        const data = JSON.stringify(settings, null, 2); // עיצוב ה-JSON עם הזחה לקריאות
        await fs.writeFile(PRESETS_FILE_PATH, data, 'utf-8');
    } catch (error) {
        console.error('Error saving presets:', error);
        // ניתן להוסיף כאן טיפול בשגיאות מתקדם יותר אם נדרש, כגון זריקת שגיאה מותאמת אישית
        throw error; // זרוק את השגיאה כדי שהקוד הקורא יוכל לטפל בה
    }
}