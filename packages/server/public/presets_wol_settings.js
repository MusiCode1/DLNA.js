// @ts-check
// קובץ זה מכיל את הלוגיקה של צד הלקוח עבור דף ניהול הפריסטים וה-Wake on LAN
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const presetForm = /** @type {HTMLFormElement | null} */ (document.getElementById('preset-form'));
    const presetNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('preset-name'));
    const presetRendererUdnSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('preset-renderer-udn'));
    const presetRendererMacInput = /** @type {HTMLInputElement | null} */ (document.getElementById('preset-renderer-mac'));
    const presetRendererBroadcastInput = /** @type {HTMLInputElement | null} */ (document.getElementById('preset-renderer-broadcast')); // הוספת שדה לכתובת שידור
    const presetMediaServerUdnSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('preset-mediaserver-udn'));
    const presetFolderObjectIdInput = /** @type {HTMLInputElement | null} */ (document.getElementById('preset-folder-object-id'));
    // const savePresetButton = document.getElementById('save-preset-button'); // Not needed, using form submit
    const clearPresetFormButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('clear-preset-form-button'));
    const presetListDisplayElement = /** @type {HTMLElement | null} */ (document.getElementById('preset-list-display'));
    const presetStatusMessageElement = /** @type {HTMLElement | null} */ (document.getElementById('preset-status-message'));

    const wolPresetSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('wol-preset-select'));
    const sendWolButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('send-wol-button'));
    const wolStatusMessageElement = /** @type {HTMLElement | null} */ (document.getElementById('wol-status-message'));

    /** @type {ApiDevice[]} */
    let availableDevices = []; // לשמירת כל המכשירים שנטענו
    /** @type {Object<string, PresetSettings>} */
    let existingPresets = {}; // לשמירת הפריסטים הקיימים (אובייקט עם שמות הפריסטים כמפתחות)

    // JSDoc type definitions
    // הטיפוסים מיובאים כעת מקובץ ה-types של השרת
    /**
     * @typedef {import("../src/types").ApiDevice} ApiDevice
     * @typedef {import("../src/types").PresetSettings} PresetSettings
     * @typedef {import("../src/types").PresetEntry} PresetEntry
     * @typedef {import("../src/types").RendererPreset} RendererPreset
     * @typedef {import("../src/types").MediaServerPreset} MediaServerPreset
     * @typedef {import("../src/types").FolderPreset} FolderPreset
     */
    // ServiceDescription מיובא ומשמש בתוך ApiDevice מ-../src/types



    // Utility function to show status messages
    function showStatusMessage(element, message, isSuccess = true) {
        if (element) {
            element.textContent = message;
            element.className = `status-message ${isSuccess ? 'success' : 'error'}`;
            element.style.display = 'block';
            setTimeout(() => {
                if (element) {
                    element.style.display = 'none';
                }
            }, 5000); // הסתר הודעה אחרי 5 שניות
        }
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
            let isRelevant = false;
            if (device.serviceList && typeof device.serviceList === 'object') {
                if (type === 'renderer') {
                    for (const serviceKey in device.serviceList) {
                        const service = device.serviceList[serviceKey];
                        if (service && service.serviceType === 'urn:schemas-upnp-org:service:AVTransport:1') {
                            isRelevant = true;
                            break;
                        }
                    }
                } else if (type === 'mediaserver') {
                    const cdService = device.serviceList['ContentDirectory'] || Object.values(device.serviceList).find(s => s.serviceType === 'urn:schemas-upnp-org:service:ContentDirectory:1');
                    if (cdService && cdService.serviceType === 'urn:schemas-upnp-org:service:ContentDirectory:1') {
                        isRelevant = true;
                    }
                }
            }

            if (isRelevant) {
                const option = document.createElement('option');
                option.value = device.UDN; // שימוש ב-UDN (אותיות גדולות)
                option.textContent = `${device.friendlyName} (${device.modelName || 'N/A'}) - UDN: ${device.UDN}`; // שימוש ב-UDN
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
            if (presetRendererUdnSelect) {
                populateDeviceSelect(presetRendererUdnSelect, availableDevices, 'renderer');
            }
            if (presetMediaServerUdnSelect) {
                populateDeviceSelect(presetMediaServerUdnSelect, availableDevices, 'mediaserver');
            }
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
        if (presetListDisplayElement) {
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
                    displayText += ` | Renderer UDN: ${preset.renderer.udn}, MAC: ${preset.renderer.macAddress}, Broadcast: ${preset.renderer.broadcastAddress || 'N/A'}`;
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
    }

    // פונקציה לאכלוס הרשימה הנפתחת של פריסטים עבור WOL
    function populateWolPresetSelect() {
        if (wolPresetSelect) {
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
    }

    // פונקציה לטעינת פריסט קיים לטופס העריכה
    function loadPresetForEditing(presetName) {
        const presetToEdit = existingPresets[presetName];
        if (!presetToEdit) return;

        if (presetNameInput) presetNameInput.value = presetName;
        
        if (presetToEdit.renderer) {
            if (presetRendererUdnSelect) presetRendererUdnSelect.value = presetToEdit.renderer.udn || '';
            if (presetRendererMacInput) presetRendererMacInput.value = presetToEdit.renderer.macAddress || '';
            if (presetRendererBroadcastInput) presetRendererBroadcastInput.value = presetToEdit.renderer.broadcastAddress || ''; // טעינת כתובת שידור
        } else {
            if (presetRendererUdnSelect) presetRendererUdnSelect.value = '';
            if (presetRendererMacInput) presetRendererMacInput.value = '';
            if (presetRendererBroadcastInput) presetRendererBroadcastInput.value = ''; // איפוס כתובת שידור
        }

        if (presetToEdit.mediaServer) {
            if (presetMediaServerUdnSelect) presetMediaServerUdnSelect.value = presetToEdit.mediaServer.udn || '';
            if (presetToEdit.mediaServer.folder) {
                if (presetFolderObjectIdInput) presetFolderObjectIdInput.value = presetToEdit.mediaServer.folder.objectId || '';
            } else {
                if (presetFolderObjectIdInput) presetFolderObjectIdInput.value = '';
            }
        } else {
            if (presetMediaServerUdnSelect) presetMediaServerUdnSelect.value = '';
            if (presetFolderObjectIdInput) presetFolderObjectIdInput.value = '';
        }
        if (presetNameInput) presetNameInput.focus(); // מיקוד על שדה שם הפריסט
    }
    
    // פונקציה לניקוי טופס הפריסט
    function clearPresetForm() {
        if (presetForm) presetForm.reset(); // מאפס את כל שדות הטופס
        if (presetRendererUdnSelect) presetRendererUdnSelect.value = ''; // ודא שגם select מאופסים
        if (presetMediaServerUdnSelect) presetMediaServerUdnSelect.value = '';
        if (presetNameInput) presetNameInput.focus();
    }


    // טיפול בשליחת טופס הפריסט
    if (presetForm) {
        presetForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // מניעת שליחה רגילה של הטופס

            const presetName = presetNameInput?.value.trim() || '';
            const rendererUdn = presetRendererUdnSelect?.value || '';
            const rendererMac = presetRendererMacInput?.value.trim() || '';
            const rendererBroadcast = presetRendererBroadcastInput?.value.trim() || ''; // קריאת כתובת שידור
            const mediaServerUdn = presetMediaServerUdnSelect?.value || '';
            const folderObjectId = presetFolderObjectIdInput?.value.trim() || '';

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
        if (!rendererBroadcast || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(rendererBroadcast)) {
            showStatusMessage(presetStatusMessageElement, 'כתובת השידור של ה-Renderer אינה תקינה.', false);
            return;
        }

        /** @type {PresetEntry} */
        const presetData = {
            name: presetName,
            settings: {
                renderer: {
                    udn: rendererUdn,
                    baseURL: availableDevices.find(d => d.UDN === rendererUdn)?.baseURL || '',
                    ipAddress: availableDevices.find(d => d.UDN === rendererUdn)?.remoteAddress || '',
                    macAddress: rendererMac,
                    broadcastAddress: rendererBroadcast // הוספת כתובת שידור
                }
            }
        };

        if (mediaServerUdn) {
            const mediaServerSettings = {
                udn: mediaServerUdn,
                baseURL: availableDevices.find(d => d.UDN === mediaServerUdn)?.baseURL || '',
            };
            if (folderObjectId) {
                /** @type {any} */ (mediaServerSettings).folder = { objectId: folderObjectId };
            }
            presetData.settings.mediaServer = /** @type {MediaServerPreset} */ (mediaServerSettings);
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
    }

    // טיפול בכפתור ניקוי טופס
    if (clearPresetFormButton) {
        clearPresetFormButton.addEventListener('click', clearPresetForm);
    }

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
            const response = await fetch(`/api/play-preset/${encodeURIComponent(presetName)}`, {
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
    if (sendWolButton) {
        sendWolButton.addEventListener('click', async () => {
            const selectedPresetName = wolPresetSelect?.value;
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
    }
    
    // אתחול בעת טעינת הדף
    async function init() {
        await loadAvailableDevices(); // טען מכשירים קודם, כדי שיהיו זמינים לטופס
        await loadPresets();          // לאחר מכן טען פריסטים, שעשויים להשתמש במידע מהמכשירים
    }

    init();
});