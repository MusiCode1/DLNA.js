"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPresets = loadPresets;
exports.savePresets = savePresets;
// קובץ זה מכיל פונקציות לניהול הגדרות הפריסטים
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const PRESETS_FILE_PATH = path.join(__dirname, 'presets.json'); // שימוש בשם ובמיקום מהמשימה
/**
 * @hebrew טוען את הגדרות הפריסט מקובץ ה-JSON וממיר אותן למערך.
 * @returns {Promise<AllPresetSettings>} אובייקט של כל הפריסטים. אם הקובץ לא קיים או לא תקין, מחזיר אובייקט ריק.
 */
async function loadPresets() {
    try {
        // בדיקה אם הקובץ קיים
        await fs.access(PRESETS_FILE_PATH);
        const data = await fs.readFile(PRESETS_FILE_PATH, 'utf-8');
        if (!data.trim()) {
            // אם הקובץ ריק, החזר אובייקט ריק
            return {};
        }
        // ניתוח ה-JSON
        const presetsObject = JSON.parse(data);
        return presetsObject;
    }
    catch (error) {
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
async function savePresets(settings) {
    try {
        const data = JSON.stringify(settings, null, 2); // עיצוב ה-JSON עם הזחה לקריאות
        await fs.writeFile(PRESETS_FILE_PATH, data, 'utf-8');
    }
    catch (error) {
        console.error('Error saving presets:', error);
        // ניתן להוסיף כאן טיפול בשגיאות מתקדם יותר אם נדרש, כגון זריקת שגיאה מותאמת אישית
        throw error; // זרוק את השגיאה כדי שהקוד הקורא יוכל לטפל בה
    }
}
