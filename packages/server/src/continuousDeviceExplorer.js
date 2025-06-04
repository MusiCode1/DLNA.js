"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinuousDeviceExplorer = void 0;
const events_1 = require("events");
const dlna_core_1 = require("@dlna-tv-play/dlna-core");
const logger = (0, dlna_core_1.createModuleLogger)('ContinuousDeviceExplorer');
// ברירות מחדל עבור הגילוי הרציף
const DEFAULT_DISCOVERY_OPTIONS = {
    timeoutMs: 30 * 1000, // 10 שניות לכל סבב גילוי
    detailLevel: dlna_core_1.DiscoveryDetailLevel.Full,
    searchTarget: 'ssdp:all',
    continuousIntervalMs: 50 * 1000
};
class ContinuousDeviceExplorer extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.isDiscovering = false;
        this.discoveryOptions = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
    }
    startDiscovery() {
        if (this.isDiscovering) {
            logger.warn('Discovery process is already running.');
            return;
        }
        logger.info('Starting continuous UPnP device discovery...');
        this.isDiscovering = true;
        this.runDiscoveryCycle(); // הפעלת סבב ראשון מיידי
        // הגדרת אינטרוול לסבבים הבאים
        this.intervalId = setInterval(() => {
            this.runDiscoveryCycle();
        }, this.discoveryOptions.continuousIntervalMs);
    }
    stopDiscovery() {
        if (!this.isDiscovering) {
            logger.warn('Discovery process is not running.');
            return;
        }
        logger.info('Stopping continuous UPnP device discovery...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = undefined;
        }
        this.isDiscovering = false;
        this.emit('stopped');
    }
    async runDiscoveryCycle() {
        if (this.abortController) { // אם יש סבב קודם שעדיין רץ, בטל אותו
            logger.debug('Aborting previous discovery cycle.');
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const currentSignal = this.abortController.signal;
        logger.debug('Starting new discovery cycle.', this.discoveryOptions);
        const onRawSsdpMessage = payload => this.emit('rawResponse', payload);
        const onDeviceFound = (device) => {
            if (currentSignal.aborted) {
                logger.debug('Device found after abort, ignoring:', device.UDN || device.usn);
                return;
            }
            // ודא שהמכשיר הוא לפחות DeviceDescription כדי לגשת לשדות הנדרשים
            if ('friendlyName' in device && 'modelName' in device && 'UDN' in device) { // תיקון ל-UDN
                this.emit('device', device);
            }
            else if ('usn' in device && device.usn) { // USN קיים ב-BasicSsdpDevice
                // אם זה רק BasicSsdpDevice, ייתכן שנרצה לפלוט אותו או לוג
                // כאן אנחנו מצפים לפחות ל-DeviceDescription כדי לפלוט, אז אם זה רק Basic, נרשום לוג.
                logger.debug('Basic SSDP device found (has USN but not full details like UDN/friendlyName yet):', device.usn);
                // אפשר לפלוט אירוע אחר או לאגור אותו לעיבוד נוסף אם רוצים
            }
        };
        try {
            await (0, dlna_core_1.discoverSsdpDevices)({
                ...this.discoveryOptions,
                abortSignal: currentSignal,
                onDeviceFound,
                onRawSsdpMessage
            });
            if (currentSignal.aborted) {
                logger.info('Discovery cycle was aborted.');
            }
            else {
                logger.debug('Discovery cycle completed.');
            }
        }
        catch (error) {
            if (currentSignal.aborted && error.message && error.message.includes('aborted')) {
                logger.info('Discovery cycle aborted as expected.');
            }
            else {
                logger.error('Error during discovery cycle:', error);
                this.emit('error', error);
            }
        }
        finally {
            if (this.abortController && this.abortController.signal === currentSignal) {
                // נקה את הבקר רק אם זה הבקר הנוכחי (למניעת race condition אם stopDiscovery נקרא)
                this.abortController = undefined;
            }
            logger.debug('Finished discovery cycle attempt.');
        }
    }
}
exports.ContinuousDeviceExplorer = ContinuousDeviceExplorer;
