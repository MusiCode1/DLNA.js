// קובץ זה מכיל את הלוגיקה של צד הלקוח עבור דף ניהול הפריסטים וה-Wake on LAN
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const presetForm = document.getElementById('preset-form');
    const presetNameInput = document.getElementById('preset-name');
    const presetRendererUdnSelect = document.getElementById('preset-renderer-udn');
    const presetRendererMacInput = document.getElementById('preset-renderer-mac');
    const presetMediaServerUdnSelect = document.getElementById('preset-mediaserver-udn');
    const presetFolderObjectIdInput = document.getElementById('preset-folder-object-id');
    // const savePresetButton = document.getElementById('save-preset-button'); // Not needed, using form submit
    const clearPresetFormButton = document.getElementById('clear-preset-form-button');
    const presetListDisplayElement = document.getElementById('preset-list-display');
    const presetStatusMessageElement = document.getElementById('preset-status-message');

    const wolPresetSelect = document.getElementById('wol-preset-select');
    const sendWolButton = document.getElementById('send-wol-button');
    const wolStatusMessageElement = document.getElementById('wol-status-message');

    /** @type {ApiDevice[]} */
    let availableDevices = []; // לשמירת כל המכשירים שנטענו
    /** @type {Object<string, PresetSettings>} */
    let existingPresets = {}; // לשמירת הפריסטים הקיימים (אובייקט עם שמות הפריסטים כמפתחות)

    // JSDoc type definitions
    /**
     * @typedef {object} ServiceDescription
     * @property {string} serviceType
     * @property {string} serviceId
     * @property {string} controlURL
     * @property {string} eventSubURL
     * @property {string} SCPDURL
     */

    /**
     * @typedef {object} ApiDevice
     * @property {string} friendlyName
     * @property {string} modelName
     * @property {string} udn
     * @property {string} [remoteAddress]
     * @property {number} lastSeen
     * @property {string} [iconUrl]
     * @property {string} [baseURL]
     * @property {ServiceDescription[]} [serviceList]
     * @property {string[]} [supportedServices]
     */

    /**
     * @typedef {object} RendererPreset
     * @property {string} udn
     * @property {string} baseURL
     * @property {string} ipAddress
     * @property {string} macAddress
     */

    /**
     * @typedef {object} FolderPreset
     * @property {string} objectId
     * @property {string|null} [path]
     */

    /**
     * @typedef {object} MediaServerPreset
     * @property {string} udn
     * @property {string} baseURL
     * @property {FolderPreset} folder
     */

    /**
     * @typedef {object} PresetSettings
     * @property {RendererPreset|null} [renderer]
     * @property {MediaServerPreset|null} [mediaServer]
     */

    /**
     * @typedef {object} PresetEntry
     * @property {string} name
     * @property {PresetSettings} settings
     */


    // Utility function to show status messages
    function showStatusMessage(element, message, isSuccess = true) {
        element.textContent = message;
        element.className = `status-message ${isSuccess ? 'success' : 'error'}`;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000); // הסתר הודעה אחרי 5 שניות
    }

    // פונקציה לאכלוס רשימות נפתחות של מכשירים
    /**
     * @param {HTMLSelectElement} selectElement
     * @param {ApiDevice[]} devices
     * @param {'renderer' | 'mediaserver'} type
     */
    function populateDeviceSelect(selectElement, devices, type) {
        // שמירת הערך הנבחר הנוכחי (אם קיים)
        const currentValue = selectElement.value;
        selectElement.innerHTML = `<option value="">בחר ${type === 'renderer' ? 'Renderer' : 'Media Server'}${type === 'mediaserver' ? ' (אופציונלי)' : ''}</option>`; // איפוס
        devices.forEach(device => {
            // סינון לפי סוג אם נדרש (למשל, רק renderers או רק media servers)
            let isRelevant = false;
            if (type === 'renderer') {
                if (device.supportedServices && device.supportedServices.includes('urn:schemas-upnp-org:service:AVTransport:1')) {
                    isRelevant = true;
                }
            } else if (type === 'mediaserver') {
                if (device.supportedServices && device.supportedServices.includes('urn:schemas-upnp-org:service:ContentDirectory:1')) {
                    isRelevant = true;
                }
            }

            if (isRelevant) {
                const option = document.createElement('option');
                option.value = device.udn;
                option.textContent = `${device.friendlyName} (${device.modelName || 'N/A'}) - UDN: ${device.udn}`;
                // הוספת מידע נוסף אם קיים, כמו IP
                if (device.remoteAddress) { // תוקן ל-remoteAddress בהתאם למשוב המשתמש והטיפוס ApiDevice
                     option.textContent += ` - IP: ${device.remoteAddress}`;
                }
                selectElement.appendChild(option);
            }
        });
        // שחזור הערך הנבחר אם הוא עדיין קיים ברשימה החדשה
        if (currentValue && Array.from(selectElement.options).some(opt => opt.value === currentValue)) {
            selectElement.value = currentValue;
        }
    }

    // פונקציה לטעינת מכשירים מהשרת
    /** @returns {Promise<void>} */
    async function loadAvailableDevices() {
        try {
            const response = await fetch('/api/devices');
            if (!response.ok) {
                throw new Error(`שגיאת HTTP! סטטוס: ${response.status}`);
            }
            /** @type {ApiDevice[]} */
            const loadedDevices = await response.json();
            availableDevices = loadedDevices;
            populateDeviceSelect(presetRendererUdnSelect, availableDevices, 'renderer');
            populateDeviceSelect(presetMediaServerUdnSelect, availableDevices, 'mediaserver');
        } catch (error) {
            console.error('שגיאה בטעינת מכשירים:', error);
            showStatusMessage(presetStatusMessageElement, `שגיאה בטעינת רשימת המכשירים: ${error.message}`, false);
        }
    }

    // פונקציה לטעינת פריסטים קיימים
    /** @returns {Promise<void>} */
    async function loadPresets() {
        try {
            const response = await fetch('/api/presets');
            if (!response.ok) {
                throw new Error(`שגיאת HTTP! סטטוס: ${response.status}`);
            }
            /** @type {PresetEntry[]} */
            const presetsArray = await response.json();
            existingPresets = {}; // איפוס
            presetsArray.forEach(p => {
                if (p && p.name) { // בדיקה נוספת למניעת שגיאות
                    existingPresets[p.name] = p.settings;
                }
            });

            renderPresetList();
            populateWolPresetSelect();
        } catch (error) {
            console.error('שגיאה בטעינת פריסטים:', error);
            showStatusMessage(presetStatusMessageElement, `שגיאה בטעינת פריסטים: ${error.message}`, false);
        }
    }

    // פונקציה להצגת רשימת הפריסטים
    function renderPresetList() {
        presetListDisplayElement.innerHTML = ''; // ניקוי הרשימה
        if (Object.keys(existingPresets).length === 0) {
            const li = document.createElement('li');
            li.textContent = 'לא נמצאו פריסטים שמורים.';
            presetListDisplayElement.appendChild(li);
            return;
        }

        for (const presetName in existingPresets) {
            const preset = existingPresets[presetName];
            const li = document.createElement('li');
            
            let displayText = `שם: ${presetName}`;
            if (preset.renderer) {
                displayText += ` | Renderer UDN: ${preset.renderer.udn}, MAC: ${preset.renderer.macAddress}`;
            }
            if (preset.mediaServer) {
                displayText += ` | Media Server UDN: ${preset.mediaServer.udn}`;
                if (preset.mediaServer.folder) {
                    displayText += `, Folder ID: ${preset.mediaServer.folder.objectId}`;
                }
            }
            
            const textSpan = document.createElement('span');
            textSpan.textContent = displayText;

            const buttonsDiv = document.createElement('div');

            const editButton = document.createElement('button');
            editButton.textContent = 'טען לעריכה';
            editButton.className = 'btn btn-primary';
            editButton.style.backgroundColor = '#ffc107'; // צבע אזהרה לטעינה
            editButton.onclick = () => loadPresetForEditing(presetName);
            
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'מחק';
            deleteButton.className = 'btn btn-danger';
            deleteButton.onclick = () => deletePreset(presetName);

            const playButton = document.createElement('button');
            playButton.textContent = 'הפעל';
            playButton.className = 'btn btn-success'; // צבע ירוק להפעלה
            playButton.onclick = () => playPreset(presetName);

            buttonsDiv.appendChild(playButton); // הוספת כפתור הפעלה
            buttonsDiv.appendChild(editButton);
            buttonsDiv.appendChild(deleteButton);
            
            li.appendChild(textSpan);
            li.appendChild(buttonsDiv);
            presetListDisplayElement.appendChild(li);
        }
    }

    // פונקציה לאכלוס הרשימה הנפתחת של פריסטים עבור WOL
    function populateWolPresetSelect() {
        // שמירת הערך הנבחר הנוכחי
        const currentValue = wolPresetSelect.value;
        wolPresetSelect.innerHTML = '<option value="">בחר פריסט</option>'; // איפוס
        for (const presetName in existingPresets) {
            // רק פריסטים עם MAC Address רלוונטיים ל-WOL
            if (existingPresets[presetName].renderer && existingPresets[presetName].renderer.macAddress) {
                const option = document.createElement('option');
                option.value = presetName;
                option.textContent = presetName;
                wolPresetSelect.appendChild(option);
            }
        }
        // שחזור הערך הנבחר אם הוא עדיין קיים ברשימה החדשה
         if (currentValue && Array.from(wolPresetSelect.options).some(opt => opt.value === currentValue)) {
            wolPresetSelect.value = currentValue;
        }
    }

    // פונקציה לטעינת פריסט קיים לטופס העריכה
    function loadPresetForEditing(presetName) {
        const presetToEdit = existingPresets[presetName];
        if (!presetToEdit) return;

        presetNameInput.value = presetName;
        
        if (presetToEdit.renderer) {
            presetRendererUdnSelect.value = presetToEdit.renderer.udn || '';
            presetRendererMacInput.value = presetToEdit.renderer.macAddress || '';
        } else {
            presetRendererUdnSelect.value = '';
            presetRendererMacInput.value = '';
        }

        if (presetToEdit.mediaServer) {
            presetMediaServerUdnSelect.value = presetToEdit.mediaServer.udn || '';
            if (presetToEdit.mediaServer.folder) {
                presetFolderObjectIdInput.value = presetToEdit.mediaServer.folder.objectId || '';
            } else {
                presetFolderObjectIdInput.value = '';
            }
        } else {
            presetMediaServerUdnSelect.value = '';
            presetFolderObjectIdInput.value = '';
        }
        presetNameInput.focus(); // מיקוד על שדה שם הפריסט
    }
    
    // פונקציה לניקוי טופס הפריסט
    function clearPresetForm() {
        presetForm.reset(); // מאפס את כל שדות הטופס
        presetRendererUdnSelect.value = ''; // ודא שגם select מאופסים
        presetMediaServerUdnSelect.value = '';
        presetNameInput.focus();
    }


    // טיפול בשליחת טופס הפריסט
    presetForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // מניעת שליחה רגילה של הטופס

        const presetName = presetNameInput.value.trim();
        const rendererUdn = presetRendererUdnSelect.value;
        const rendererMac = presetRendererMacInput.value.trim();
        const mediaServerUdn = presetMediaServerUdnSelect.value;
        const folderObjectId = presetFolderObjectIdInput.value.trim();

        if (!presetName) {
            showStatusMessage(presetStatusMessageElement, 'שם פריסט הוא שדה חובה.', false);
            return;
        }
        if (!rendererUdn) {
            showStatusMessage(presetStatusMessageElement, 'יש לבחור התקן Renderer.', false);
            return;
        }
        if (!rendererMac || !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(rendererMac)) {
            showStatusMessage(presetStatusMessageElement, 'כתובת MAC של ה-Renderer אינה תקינה.', false);
            return;
        }

        /** @type {PresetEntry} */
        const presetData = {
            name: presetName,
            settings: {
                renderer: {
                    udn: rendererUdn,
                    baseURL: availableDevices.find(d => d.udn === rendererUdn)?.baseURL || '', // שינוי ל-string ריק במקום null כדי להתאים לטיפוס
                    ipAddress: availableDevices.find(d => d.udn === rendererUdn)?.remoteAddress || '', // שינוי ל-string ריק
                    macAddress: rendererMac
                }
            }
        };

        if (mediaServerUdn) {
            presetData.settings.mediaServer = {
                udn: mediaServerUdn,
                baseURL: availableDevices.find(d => d.udn === mediaServerUdn)?.baseURL || '' // שינוי ל-string ריק
            };
            if (folderObjectId) {
                // @ts-ignore - TypeScript עשוי להתלונן כאן כי mediaServer יכול להיות null באופן תיאורטי, אבל הלוגיקה מבטיחה שהוא קיים
                presetData.settings.mediaServer.folder = {
                    objectId: folderObjectId
                    // path יכול להתווסף כאן אם יש דרך לקבל אותו, כרגע לא נכלל
                };
            }
        } else if (folderObjectId) {
            // אם הוזן folderObjectId אבל לא נבחר Media Server
            showStatusMessage(presetStatusMessageElement, 'יש לבחור Media Server אם הוזן Folder Object ID.', false);
            return;
        }


        try {
            const response = await fetch('/api/presets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(presetData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `שגיאת HTTP! סטטוס: ${response.status}`);
            }

            showStatusMessage(presetStatusMessageElement, result.message || 'הפריסט נשמר בהצלחה!', true);
            clearPresetForm();
            loadPresets(); // טעינה מחדש של הפריסטים
        } catch (error) {
            console.error('שגיאה בשמירת פריסט:', error);
            showStatusMessage(presetStatusMessageElement, `שגיאה בשמירת פריסט: ${error.message}`, false);
        }
    });

    // טיפול בכפתור ניקוי טופס
    clearPresetFormButton.addEventListener('click', clearPresetForm);

    // פונקציה למחיקת פריסט
    async function deletePreset(presetName) {
        if (!confirm(`האם אתה בטוח שברצונך למחוק את הפריסט "${presetName}"?`)) {
            return;
        }
        try {
            // ה-API לניהול פריסטים מצפה לשם הפריסט בגוף הבקשה עבור מחיקה
            const response = await fetch('/api/presets', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: presetName }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `שגיאת HTTP! סטטוס: ${response.status}`);
            }
            showStatusMessage(presetStatusMessageElement, result.message || `הפריסט "${presetName}" נמחק בהצלחה.`, true);
            loadPresets(); // טעינה מחדש של הפריסטים
        } catch (error) {
            console.error(`שגיאה במחיקת פריסט "${presetName}":`, error);
            showStatusMessage(presetStatusMessageElement, `שגיאה במחיקת פריסט: ${error.message}`, false);
        }
    }
 
    // פונקציה להפעלת פריסט
    async function playPreset(presetName) {
        if (!presetName) {
            showStatusMessage(presetStatusMessageElement, 'שם פריסט לא סופק להפעלה.', false);
            return;
        }
        // הצגת הודעת "טוען..." או חיווי דומה יכולה להתווסף כאן
        // לדוגמה, שינוי טקסט הכפתור או הצגת ספינר.
        // כרגע, נשתמש בהודעת סטטוס כללית.
        showStatusMessage(presetStatusMessageElement, `מנסה להפעיל את פריסט '${presetName}'...`, true);

        try {
            const response = await fetch(`/api/play-preset?presetName=${encodeURIComponent(presetName)}`, {
                method: 'GET', // השיטה היא GET לפי השרת
            });
            const result = await response.json();

            if (!response.ok) {
                // הודעת השגיאה מהשרת תהיה ב-result.error
                throw new Error(result.error || `שגיאת HTTP! סטטוס: ${response.status}`);
            }

            // אם השרת מחזיר success: true, אז ההודעה תהיה ב-result.message
            showStatusMessage(presetStatusMessageElement, result.message || `הפעלת פריסט '${presetName}' נשלחה בהצלחה.`, true);

        } catch (error) {
            console.error(`שגיאה בהפעלת פריסט '${presetName}':`, error);
            showStatusMessage(presetStatusMessageElement, `שגיאה בהפעלת פריסט '${presetName}': ${error.message}`, false);
        }
    }
 
    // טיפול בכפתור שליחת WOL
    sendWolButton.addEventListener('click', async () => {
        const selectedPresetName = wolPresetSelect.value;
        if (!selectedPresetName) {
            showStatusMessage(wolStatusMessageElement, 'יש לבחור פריסט לשליחת פקודת WOL.', false);
            return;
        }

        try {
            const response = await fetch(`/api/wol/wake/${encodeURIComponent(selectedPresetName)}`, {
                method: 'POST',
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `שגיאת HTTP! סטטוס: ${response.status}`);
            }
            showStatusMessage(wolStatusMessageElement, result.message || `פקודת WOL נשלחה בהצלחה לפריסט '${selectedPresetName}'.`, true);
        } catch (error) {
            console.error('שגיאה בשליחת WOL:', error);
            showStatusMessage(wolStatusMessageElement, `שגיאה בשליחת WOL: ${error.message}`, false);
        }
    });
    
    // אתחול בעת טעינת הדף
    async function init() {
        await loadAvailableDevices(); // טען מכשירים קודם, כדי שיהיו זמינים לטופס
        await loadPresets();          // לאחר מכן טען פריסטים, שעשויים להשתמש במידע מהמכשירים
    }

    init();
});