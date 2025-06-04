import { AllPresetSettings } from './types';
/**
 * @hebrew טוען את הגדרות הפריסט מקובץ ה-JSON וממיר אותן למערך.
 * @returns {Promise<AllPresetSettings>} אובייקט של כל הפריסטים. אם הקובץ לא קיים או לא תקין, מחזיר אובייקט ריק.
 */
export declare function loadPresets(): Promise<AllPresetSettings>;
/**
 * @hebrew שומר את כלל הגדרות הפריסט הנתונות לקובץ ה-JSON.
 * @param {AllPresetSettings} settings - אובייקט כלל ההגדרות לשמירה.
 * @returns {Promise<void>}
 */
export declare function savePresets(settings: AllPresetSettings): Promise<void>;
