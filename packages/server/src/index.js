"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv")); // הוספת ייבוא עבור dotenv
dotenv_1.default.config(); // טעינת משתני סביבה מקובץ .env
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path")); // הוספת ייבוא עבור path
const continuousDeviceExplorer_1 = require("./continuousDeviceExplorer"); // ייבוא המחלקה החדשה
// ייבוא טיפוסים מהאינדקס, הוספת BrowseFlag
const browseHandler_1 = require("./browseHandler"); // ייבוא ה-handler החדש
const rendererHandler_1 = require("./rendererHandler"); // ייבוא ה-handler החדש עבור renderers ופונקציית העזר
const presetManager_1 = require("./presetManager"); // ייבוא פונקציות לניהול פריסטים
const wake_on_lan_1 = require("@dlna-tv-play/wake-on-lan"); // ייבוא פונקציה לשליחת WOL ובדיקת פינג
const dlna_core_1 = require("@dlna-tv-play/dlna-core");
const logger = (0, dlna_core_1.createModuleLogger)('Server');
const MAX_RAW_MESSAGES = 100; // קבוע לגודל המאגר
const rawMessagesBuffer = []; // מאגר לאחסון ההודעות
const app = (0, express_1.default)();
const port = process.env.PORT || 3300;
// אפשרות להעביר אופציות מותאמות אישית ל-ContinuousDeviceExplorer
const discoveryOptions = {
    detailLevel: dlna_core_1.DiscoveryDetailLevel.Full, // בקש מספיק פרטים עבור ה-API
    includeIPv6: false,
    timeoutMs: 60 * 1000,
    continuousIntervalMs: 70 * 1000
};
const deviceExplorer = new continuousDeviceExplorer_1.ContinuousDeviceExplorer(discoveryOptions);
let activeDevices = new Map(); // שימוש ב-Map לניהול קל יותר של מכשירים לפי UDN
// Middleware to parse JSON bodies
app.use(express_1.default.json());
// הגשת קבצים סטטיים מהתיקייה public
// ודא שהנתיב לתיקיית public נכון ביחס למיקום קובץ השרת
const publicPathDirectory = path_1.default.join('.', 'public'); // תיקון הנתיב בהנחה שהקוד המקומפל נמצא ב-dist/server
logger.info(`Serving static files from: ${publicPathDirectory}`);
app.use(express_1.default.static(publicPathDirectory)); // הסרת האובייקט הריק כאופציה שנייה, הוא מיותר
// Endpoint to get discovered devices
// ה-route הידני להגשת index.html הוסר מכיוון ש-express.static אמור לטפל בזה
app.get('/api/devices', (req, res) => {
    const devicesArray = Array.from(activeDevices.values());
    res.json(devicesArray);
});
// Endpoint for browsing ContentDirectory
app.post('/api/devices/:udn/browse', (req, res, next) => {
    // העברת activeDevices ל-handler
    (0, browseHandler_1.handleBrowseRequest)(req, res, next, activeDevices);
});
// Endpoint for controlling renderers
const rendererRouter = (0, rendererHandler_1.createRendererHandler)(activeDevices);
app.use('/api/renderers', rendererRouter);
// נקודת קצה חדשה להחזרת הודעות גולמיות
app.get('/api/raw-messages', (req, res) => {
    res.json(rawMessagesBuffer);
});
// נקודות קצה לניהול הגדרות פריסט
app.get('/api/presets', async (req, res, next) => {
    try {
        const presetsObject = await (0, presetManager_1.loadPresets)();
        // המרה של אובייקט הפריסטים למערך של פריסטים עבור הלקוח
        const presetsArray = Object.keys(presetsObject).map(presetName => {
            return {
                name: presetName,
                settings: presetsObject[presetName]
            };
        });
        res.json(presetsArray);
    }
    catch (error) {
        logger.error('Error loading presets:', error);
        // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
        next(error);
    }
});
app.post('/api/presets', async (req, res, next) => {
    try {
        const newOrUpdatedPresetEntry = req.body; // הלקוח שולח PresetEntry בודד
        if (!newOrUpdatedPresetEntry || !newOrUpdatedPresetEntry.name || !newOrUpdatedPresetEntry.settings) {
            logger.error('Invalid preset data received for saving.');
            res.status(400).json({ error: 'Invalid preset data. "name" and "settings" are required.' });
            return;
        }
        // 1. טען את כל הפריסטים הקיימים כאובייקט
        const allPresetsObject = await (0, presetManager_1.loadPresets)();
        // 2. עדכן/הוסף את הפריסט החדש לאובייקט
        allPresetsObject[newOrUpdatedPresetEntry.name] = newOrUpdatedPresetEntry.settings;
        // 3. שמור את האובייקט המעודכן
        await (0, presetManager_1.savePresets)(allPresetsObject);
        res.status(200).json({ message: `Preset '${newOrUpdatedPresetEntry.name}' saved successfully.` });
    }
    catch (error) {
        logger.error('Error saving presets:', error);
        // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
        next(error);
    }
});
// נקודת קצה למחיקת פריסט
app.delete('/api/presets', async (req, res, next) => {
    try {
        const { name: presetNameToDelete } = req.body;
        if (!presetNameToDelete || typeof presetNameToDelete !== 'string') {
            logger.warn('Preset name not provided or invalid for deletion.');
            res.status(400).json({ error: 'Preset name (string) is required in the request body for deletion.' });
            return;
        }
        logger.info(`Received request to delete preset: ${presetNameToDelete}`);
        const allPresetsObject = await (0, presetManager_1.loadPresets)();
        if (!allPresetsObject.hasOwnProperty(presetNameToDelete)) {
            logger.warn(`Preset with name '${presetNameToDelete}' not found for deletion.`);
            res.status(404).json({ error: `Preset with name '${presetNameToDelete}' not found.` });
            return;
        }
        delete allPresetsObject[presetNameToDelete];
        await (0, presetManager_1.savePresets)(allPresetsObject);
        logger.info(`Preset '${presetNameToDelete}' deleted successfully.`);
        res.status(200).json({ message: `Preset '${presetNameToDelete}' deleted successfully.` });
    }
    catch (error) {
        logger.error('Error deleting preset:', error);
        next(error); // העבר ל-middleware הכללי לטיפול בשגיאות
    }
});
// נקודת קצה חדשה להפעלת פריסט
app.get('/api/play-preset', async (req, res, next) => {
    logger.info('Received request for /api/play-preset');
    const presetName = req.query.presetName;
    if (!presetName) {
        logger.warn('Preset name not provided in query parameters for /api/play-preset.');
        res.status(400).json({ error: "Preset name is required as a query parameter (e.g., /api/play-preset?presetName=MyPreset)." });
        return;
    }
    logger.info(`Attempting to play preset: ${presetName}`);
    try {
        const allPresetsObject = await (0, presetManager_1.loadPresets)();
        const presetSettings = allPresetsObject[presetName];
        if (!presetSettings) {
            logger.warn(`Preset with name '${presetName}' not found.`);
            res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
            return;
        }
        // presetSettings הוא כבר מהסוג הנכון (PresetSettings)
        // בדיקת תקינות הגדרות הפריסט
        if (!presetSettings.renderer?.udn ||
            !presetSettings.renderer?.baseURL ||
            !presetSettings.renderer?.ipAddress ||
            !presetSettings.renderer?.macAddress ||
            !presetSettings.mediaServer?.udn ||
            !presetSettings.mediaServer?.baseURL ||
            !presetSettings.mediaServer?.folder?.objectId) {
            logger.error(`Preset '${presetName}' is missing required settings.`);
            res.status(400).json({ error: `Preset '${presetName}' is incomplete. Please check its configuration.` });
            return;
        }
        const rendererPreset = presetSettings.renderer;
        const mediaServerPreset = presetSettings.mediaServer;
        const folderObjectId = mediaServerPreset.folder.objectId;
        logger.info(`Found preset '${presetName}'. Renderer: ${rendererPreset.udn}, IP: ${rendererPreset.ipAddress}, MAC: ${rendererPreset.macAddress}, Media Server: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
        // בדיקה אם ה-Renderer פעיל
        let rendererDevice = activeDevices.get(rendererPreset.udn);
        if (!rendererDevice) {
            logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is not in active devices. Attempting WOL and revival.`);
            try {
                await (0, wake_on_lan_1.sendWakeOnLan)(rendererPreset.macAddress);
                logger.info(`WOL packet sent to ${rendererPreset.macAddress} for preset '${presetName}'. Waiting for device to respond...`);
            }
            catch (wolError) {
                logger.warn(`Could not send WOL packet to ${rendererPreset.macAddress} for preset '${presetName}' (device might be on or error sending): ${wolError.message}`);
                // לא נחזיר שגיאה מיידית, ננסה פינג בכל מקרה
            }
            // המתנה של 5 שניות לפני בדיקת פינג ראשונית, כפי שמוצע בתוכנית
            await new Promise(resolve => setTimeout(resolve, 5000));
            // קריאה מתוקנת ל-checkPingWithRetries:
            // totalTimeoutSeconds: 18 (5 ניסיונות * 2 שניות לפינג + 4 מרווחים * 2 שניות למרווח)
            // pingIntervalSeconds: 2
            // singlePingTimeoutSeconds: 2
            const pingSuccess = await (0, wake_on_lan_1.checkPingWithRetries)(rendererPreset.ipAddress, 18, 2, 2);
            if (!pingSuccess) {
                logger.error(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' did not respond to ping after WOL attempt.`);
                res.status(503).json({ error: `Renderer for preset '${presetName}' did not respond after Wake on LAN and ping attempts.` });
                return;
            }
            logger.info(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' responded to ping.`);
            logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL}`);
            const revivedDevice = await (0, dlna_core_1.processUpnpDeviceFromUrl)(rendererPreset.baseURL, dlna_core_1.DiscoveryDetailLevel.Services);
            if (!revivedDevice) {
                logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
                res.status(503).json({ error: `Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.` });
                return;
            }
            // ProcessedDevice יכול להיות אחד מכמה טיפוסים. נבדוק אם יש לו את השדות הנדרשים.
            if ('friendlyName' in revivedDevice && 'modelName' in revivedDevice && 'UDN' in revivedDevice) {
                // העברת הלוג לתוך הבלוק הזה כדי להבטיח ש-revivedDevice.UDN קיים
                logger.info(`Successfully revived renderer ${revivedDevice.UDN} for preset '${presetName}'. Updating active devices.`);
                updateDeviceList(revivedDevice);
                rendererDevice = activeDevices.get(rendererPreset.udn); // נסה לקבל אותו שוב מהרשימה המעודכנת
                if (!rendererDevice) {
                    logger.error(`Renderer ${rendererPreset.udn} still not found in active devices after revival for preset '${presetName}'. This should not happen.`);
                    res.status(500).json({ error: `Internal error: Renderer for preset '${presetName}' could not be fully processed after revival.` });
                    return;
                }
            }
            else {
                logger.warn(`Revived device for preset '${presetName}' (UDN from USN if available: ${revivedDevice.usn}) does not have full details. Playback might fail.`);
                // נמשיך, playFolderOnRenderer יטפל אם המכשיר לא תקין.
            }
        }
        else {
            logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is already active.`);
        }
        // בדיקה שה-Media Server פעיל (למרות שלא מנסים להעיר אותו כרגע)
        const mediaServerDevice = activeDevices.get(mediaServerPreset.udn);
        if (!mediaServerDevice) {
            logger.warn(`Media Server ${mediaServerPreset.udn} for preset '${presetName}' is not in active devices. Playback might fail.`);
            res.status(404).json({ error: `Media Server for preset '${presetName}' is not currently available.` });
            return;
        }
        // הפעלת המדיה
        logger.info(`Attempting to play preset '${presetName}': Renderer UDN: ${rendererPreset.udn}, Media Server UDN: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
        const result = await (0, rendererHandler_1.playFolderOnRenderer)(rendererPreset.udn, mediaServerPreset.udn, folderObjectId, activeDevices, logger);
        if (result.success) {
            logger.info(`Preset '${presetName}' playback command successful: ${result.message}`);
            res.status(200).json({ success: true, message: result.message });
            return;
        }
        else {
            logger.error(`Preset '${presetName}' playback command failed: ${result.message}`, { statusCode: result.statusCode });
            res.status(result.statusCode || 500).json({ error: result.message });
            return;
        }
    }
    catch (error) {
        logger.error(`Unexpected error during /api/play-preset (preset: ${presetName || 'N/A'}) processing:`, error);
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        next(error);
    }
});
// נקודת קצה חדשה להפעלת פריסט
app.get('/api/play-preset/:presetName', async (req, res, next) => {
    logger.info('Received request for /api/play-preset');
    const { presetName } = req.params;
    if (!presetName) {
        logger.warn('Preset name not provided in query parameters for /api/play-preset.');
        res.status(400).json({ error: "Preset name is required as a query parameter (e.g., /api/play-preset?presetName=MyPreset)." });
        return;
    }
    logger.info(`Attempting to play preset: ${presetName}`);
    try {
        const allPresetsObject = await (0, presetManager_1.loadPresets)();
        const presetSettings = allPresetsObject[presetName];
        if (!presetSettings) {
            logger.warn(`Preset with name '${presetName}' not found.`);
            res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
            return;
        }
        // presetSettings הוא כבר מהסוג הנכון (PresetSettings)
        // בדיקת תקינות הגדרות הפריסט
        if (!presetSettings.renderer?.udn ||
            !presetSettings.renderer?.baseURL ||
            !presetSettings.renderer?.ipAddress ||
            !presetSettings.renderer?.macAddress ||
            !presetSettings.mediaServer?.udn ||
            !presetSettings.mediaServer?.baseURL ||
            !presetSettings.mediaServer?.folder?.objectId) {
            logger.error(`Preset '${presetName}' is missing required settings.`);
            res.status(400).json({ error: `Preset '${presetName}' is incomplete. Please check its configuration.` });
            return;
        }
        const rendererPreset = presetSettings.renderer;
        const mediaServerPreset = presetSettings.mediaServer;
        const folderObjectId = mediaServerPreset.folder.objectId;
        logger.info(`Found preset '${presetName}'. Renderer: ${rendererPreset.udn}, IP: ${rendererPreset.ipAddress}, MAC: ${rendererPreset.macAddress}, Media Server: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
        // בדיקה אם ה-Renderer פעיל
        let rendererDevice = activeDevices.get(rendererPreset.udn);
        if (!rendererDevice) {
            logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is not in active devices. Attempting WOL and revival.`);
            try {
                await (0, wake_on_lan_1.sendWakeOnLan)(rendererPreset.macAddress);
                logger.info(`WOL packet sent to ${rendererPreset.macAddress} for preset '${presetName}'. Waiting for device to respond...`);
            }
            catch (wolError) {
                logger.warn(`Could not send WOL packet to ${rendererPreset.macAddress} for preset '${presetName}' (device might be on or error sending): ${wolError.message}`);
                // לא נחזיר שגיאה מיידית, ננסה פינג בכל מקרה
            }
            // המתנה של 5 שניות לפני בדיקת פינג ראשונית, כפי שמוצע בתוכנית
            await new Promise(resolve => setTimeout(resolve, 5000));
            // קריאה מתוקנת ל-checkPingWithRetries:
            // totalTimeoutSeconds: 18 (5 ניסיונות * 2 שניות לפינג + 4 מרווחים * 2 שניות למרווח)
            // pingIntervalSeconds: 2
            // singlePingTimeoutSeconds: 2
            const pingSuccess = await (0, wake_on_lan_1.checkPingWithRetries)(rendererPreset.ipAddress, 18, 2, 2);
            if (!pingSuccess) {
                logger.error(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' did not respond to ping after WOL attempt.`);
                res.status(503).json({ error: `Renderer for preset '${presetName}' did not respond after Wake on LAN and ping attempts.` });
                return;
            }
            logger.info(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' responded to ping.`);
            logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL}`);
            const revivedDevice = await (0, dlna_core_1.processUpnpDeviceFromUrl)(rendererPreset.baseURL, dlna_core_1.DiscoveryDetailLevel.Services);
            if (!revivedDevice) {
                logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
                res.status(503).json({ error: `Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.` });
                return;
            }
            // ProcessedDevice יכול להיות אחד מכמה טיפוסים. נבדוק אם יש לו את השדות הנדרשים.
            if ('friendlyName' in revivedDevice && 'modelName' in revivedDevice && 'UDN' in revivedDevice) {
                // העברת הלוג לתוך הבלוק הזה כדי להבטיח ש-revivedDevice.UDN קיים
                logger.info(`Successfully revived renderer ${revivedDevice.UDN} for preset '${presetName}'. Updating active devices.`);
                updateDeviceList(revivedDevice);
                rendererDevice = activeDevices.get(rendererPreset.udn); // נסה לקבל אותו שוב מהרשימה המעודכנת
                if (!rendererDevice) {
                    logger.error(`Renderer ${rendererPreset.udn} still not found in active devices after revival for preset '${presetName}'. This should not happen.`);
                    res.status(500).json({ error: `Internal error: Renderer for preset '${presetName}' could not be fully processed after revival.` });
                    return;
                }
            }
            else {
                logger.warn(`Revived device for preset '${presetName}' (UDN from USN if available: ${revivedDevice.usn}) does not have full details. Playback might fail.`);
                // נמשיך, playFolderOnRenderer יטפל אם המכשיר לא תקין.
            }
        }
        else {
            logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is already active.`);
        }
        // בדיקה שה-Media Server פעיל (למרות שלא מנסים להעיר אותו כרגע)
        const mediaServerDevice = activeDevices.get(mediaServerPreset.udn);
        if (!mediaServerDevice) {
            logger.warn(`Media Server ${mediaServerPreset.udn} for preset '${presetName}' is not in active devices. Playback might fail.`);
            res.status(404).json({ error: `Media Server for preset '${presetName}' is not currently available.` });
            return;
        }
        // הפעלת המדיה
        logger.info(`Attempting to play preset '${presetName}': Renderer UDN: ${rendererPreset.udn}, Media Server UDN: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
        const result = await (0, rendererHandler_1.playFolderOnRenderer)(rendererPreset.udn, mediaServerPreset.udn, folderObjectId, activeDevices, logger);
        if (result.success) {
            logger.info(`Preset '${presetName}' playback command successful: ${result.message}`);
            res.status(200).json({ success: true, message: result.message });
            return;
        }
        else {
            logger.error(`Preset '${presetName}' playback command failed: ${result.message}`, { statusCode: result.statusCode });
            res.status(result.statusCode || 500).json({ error: result.message });
            return;
        }
    }
    catch (error) {
        logger.error(`Unexpected error during /api/play-preset (preset: ${presetName || 'N/A'}) processing:`, error);
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        next(error);
    }
});
// נקודת קצה לשליחת Wake on LAN לפריסט ספציפי
app.post('/api/wol/wake/:presetName', async (req, res, next) => {
    const { presetName } = req.params;
    logger.info(`Received WOL request for preset: ${presetName}`);
    try {
        const allPresetsObject = await (0, presetManager_1.loadPresets)(); // טעינת כל הפריסטים כאובייקט
        // חיפוש הפריסט הספציפי באובייקט
        const presetDetails = allPresetsObject[presetName];
        if (!presetDetails) {
            logger.warn(`Preset with name '${presetName}' not found for WOL request.`);
            res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
            return;
        }
        // בדיקה אם לפריסט יש הגדרות renderer וכתובת MAC
        const rendererInfo = presetDetails.renderer;
        if (!rendererInfo || !rendererInfo.macAddress) {
            logger.warn(`Preset '${presetName}' does not have a renderer with a MAC address.`);
            res.status(400).json({ error: `Preset '${presetName}' is not configured with a Renderer MAC address for Wake on LAN.` });
            return;
        }
        const macAddress = rendererInfo.macAddress;
        // ולידציה בסיסית של כתובת ה-MAC (ניתן להרחיב לפי הצורך)
        // הפונקציה sendWakeOnLan כבר מבצעת ולידציה פנימית
        // const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        // if (!macRegex.test(macAddress)) {
        //   logger.error(`Invalid MAC address format for preset '${presetName}': ${macAddress}`);
        //   return res.status(400).json({ error: `Invalid MAC address format: ${macAddress}` });
        // }
        logger.info(`Attempting to send Wake on LAN to preset '${presetName}' (MAC: ${macAddress})`);
        // קריאה לפונקציה לשליחת חבילת WOL
        // הפונקציה sendWakeOnLan מחזירה true אם הצליחה לשלוח את החבילה,
        // או זורקת שגיאה במקרה של MAC לא תקין או כשל בשליחה.
        await (0, wake_on_lan_1.sendWakeOnLan)(macAddress);
        logger.info(`Successfully sent Wake on LAN packet to MAC address: ${macAddress} for preset '${presetName}'.`);
        res.status(200).json({ message: `Wake on LAN signal sent successfully to preset '${presetName}'.` });
    }
    catch (error) {
        logger.error(`Error sending Wake on LAN for preset '${presetName}': ${error.message}`, error);
        // טיפול בשגיאות ספציפיות מ-sendWakeOnLan
        if (error.message && error.message.toLowerCase().includes('invalid mac address')) {
            res.status(400).json({ error: `Invalid MAC address format for preset '${presetName}'. Details: ${error.message}` });
            return;
        }
        if (error.message && error.message.toLowerCase().includes('failed to send wol packet')) {
            res.status(500).json({ error: `Failed to send WoL packet for preset '${presetName}'. Details: ${error.message}` });
            return;
        }
        // שגיאות אחרות יועברו ל-middleware הכללי לטיפול בשגיאות
        next(error);
    }
});
// פונקציה לעדכון רשימת המכשירים הפעילים
const updateDeviceList = (deviceData) => {
    // ודא שהשדות הנדרשים קיימים לפני הוספה/עדכון
    if (deviceData.friendlyName && deviceData.modelName && deviceData.UDN) {
        let iconUrl = undefined;
        // בדוק אם קיים iconList, baseURL, והרשימה אינה ריקה
        if (deviceData.iconList && deviceData.iconList.length > 0 && deviceData.baseURL) {
            const firstIcon = deviceData.iconList[0];
            if (firstIcon && firstIcon.url) {
                try {
                    // הרכבת ה-URL המלא של האייקון
                    // deviceData.baseURL הוא הבסיס, firstIcon.url הוא הנתיב היחסי
                    iconUrl = new URL(firstIcon.url, deviceData.baseURL).href;
                }
                catch (e) {
                    logger.warn(`Could not construct icon URL for device ${deviceData.UDN}: ${firstIcon.url}, base: ${deviceData.baseURL}`, e);
                }
            }
        }
        const supportedServices = deviceData.serviceList
            ? deviceData.serviceList.map(service => service.serviceType).filter(st => !!st)
            : [];
        const apiDevice = {
            friendlyName: deviceData.friendlyName,
            modelName: deviceData.modelName,
            udn: deviceData.UDN,
            remoteAddress: deviceData.remoteAddress,
            lastSeen: Date.now(),
            iconUrl: iconUrl,
            baseURL: deviceData.baseURL, // שמירת baseURL
            serviceList: deviceData.serviceList, // שמירת serviceList המלא
            supportedServices: supportedServices,
            presentationURL: deviceData.presentationURL, // הוספת presentationURL
            rootDoc: deviceData.location
        };
        activeDevices.set(apiDevice.udn, apiDevice);
        // עדכון הלוג כדי שיכלול את המידע החדש אם רוצים
        logger.info(`Device updated/added: ${apiDevice.friendlyName} (UDN: ${apiDevice.udn})${apiDevice.iconUrl ? ` Icon: ${apiDevice.iconUrl}` : ''}, BaseURL: ${apiDevice.baseURL}, PresentationURL: ${apiDevice.presentationURL || 'N/A'}, Services: ${supportedServices.length > 0 ? supportedServices.join(', ') : 'N/A'}`);
    }
    else {
        logger.warn('Received device data without all required fields (friendlyName, modelName, UDN)', { udn: deviceData.UDN }); // תיקון ל-UDN
    }
};
// פונקציה לגילוי מכשירים באופן רציף
const startContinuousDeviceDiscovery = () => {
    logger.info('Initializing continuous UPnP device discovery process...');
    deviceExplorer.on('device', (device) => {
        // ProcessedDevice יכול להיות אחד מכמה טיפוסים. נבדוק אם יש לו את השדות הנדרשים.
        // ContinuousDeviceExplorer כבר אמור לפלוט רק מכשירים עם הפרטים הנדרשים (לפחות DeviceDescription)
        if ( /* 'friendlyName' in device &&
          'modelName' in device &&  */'UDN' in device) { // תיקון: בדיקת UDN במקום udn
            updateDeviceList(device);
        }
        else {
            logger.debug('Received basic device without full details, UDN from USN (if available):', device.usn);
        }
    });
    // הוספת האזנה לאירוע rawResponse
    deviceExplorer.on('rawResponse', (payload) => {
        const messageString = payload.message.toString('utf-8');
        rawMessagesBuffer.push({
            ...payload,
            message: messageString,
        });
        if (rawMessagesBuffer.length > MAX_RAW_MESSAGES) {
            rawMessagesBuffer.shift();
        }
        // logger.debug(`Received raw SSDP message. Buffer size: ${rawMessagesBuffer.length}`); // הערה: ניתן להוסיף לוג אם רוצים
    });
    deviceExplorer.on('error', (err) => {
        logger.error('Error during continuous device discovery:', err);
        // כאן אפשר להחליט אם לנסות להפעיל מחדש את הגילוי או לנקוט פעולה אחרת
    });
    deviceExplorer.on('stopped', () => {
        logger.info('Continuous device discovery process has stopped.');
    });
    deviceExplorer.startDiscovery(); // התחל את תהליך הגילוי הרציף
};
// ניקוי תקופתי של מכשירים שלא נראו לאחרונה
const DEVICE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // כל 10 דקות
const MAX_DEVICE_INACTIVITY_MS = 15 * 60 * 1000; // מכשיר ייחשב לא פעיל אם לא נראה 15 דקות
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [udn, device] of activeDevices.entries()) {
        if (now - device.lastSeen > MAX_DEVICE_INACTIVITY_MS) {
            activeDevices.delete(udn);
            cleanedCount++;
            logger.info(`Removed inactive device: ${device.friendlyName} (UDN: ${udn})`);
        }
    }
    if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} inactive devices.`);
    }
}, DEVICE_CLEANUP_INTERVAL_MS);
// Error handling middleware - חייב להיות האחרון
// Middleware לטיפול בשגיאות
app.use((err, req, res, next) => {
    // רושמים את השגיאה ללוג
    logger.error('An error occurred:', err);
    // מחזירים תגובת שגיאה גנרית למשתמש
    // אין לחשוף פרטי שגיאה ספציפיים למשתמש מטעמי אבטחה
    res.status(500).json({ error: "Internal Server Error" });
});
app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
    logger.info('url: http://localhost:' + port + '/');
    startContinuousDeviceDiscovery();
});
// כיבוי חינני
process.on('SIGINT', () => {
    logger.info('SIGINT received. Stopping UPnP device discovery and server...');
    deviceExplorer.stopDiscovery();
    // תן זמן קצר לסגירת תהליכים לפני יציאה
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});
exports.default = app; // ייצוא לבדיקות פוטנציאליות או שימושים אחרים
