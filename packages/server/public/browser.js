// @ts-check
// קוד JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const udn = urlParams.get('udn');
    // ה-ObjectID מה-URL הוא כבר מקודד, וכך השרת מצפה לו וכך נשמור אותו פנימית.
    const pathIdFromUrl = urlParams.get('pathId');

    /** @type {HTMLElement | null} */
    const deviceTitleElement = document.getElementById('device-title');
    /** @type {HTMLElement | null} */
    const breadcrumbsContainer = document.getElementById('breadcrumbs-container');
    /** @type {HTMLElement | null} */
    const itemListContainer = document.getElementById('item-list-container');
    /** @type {HTMLElement | null} */
    const errorMessageArea = document.getElementById('error-message-area');
    /** @type {HTMLElement | null} */
    const browserContainer = document.getElementById('browser-container'); // קונטיינר הדפדפן
    // משתנים הקשורים למציג המדיה הוסרו


    // currentObjectId יקבע על בסיס pathIdFromUrl (המפוענח) או "0"
    let currentObjectId = pathIdFromUrl || "0";
    /** @type {{id: string, title: string}[]} */
    let currentPathTrail = []; // אתחול ריק, ייקבע בהמשך

    /** @type {{udn: string, friendlyName: string}[]} */
    let availableRenderers = []; // מערך לאחסון התקני רינדור זמינים
    let renderersLoaded = false; // דגל לציון אם התקני הרינדור נטענו
    /** @type {any | null} */ // TODO: Define a more specific type for UPnP items if possible
    let currentVideoItemForPlayTo = null; // ישמור את הפריט שנבחר ל-"Play To..."
    // הוסר: let playAllModeActive = false; // דגל לציון אם אנחנו במצב "Play All"
    // במקום זאת, נעביר פרמטר isPlayAll לפונקציות הרלוונטיות

    /** @type {HTMLElement | null} */
    const rendererModal = document.getElementById('renderer-selection-modal');
    /** @type {HTMLSelectElement | null} */
    const rendererSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('renderer-select'));
    /** @type {HTMLButtonElement | null} */
    const confirmPlayButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('confirm-play-button'));
    /** @type {HTMLButtonElement | null} */
    const cancelPlayButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('cancel-play-button'));
    /** @type {HTMLElement | null} */
    const statusMessageArea = document.getElementById('status-message-area');
    /** @type {HTMLElement | null} */
    const modalStatusMessage = document.getElementById('modal-status-message');


    const BREADCRUMB_STORAGE_KEY = `breadcrumbTrail_${udn}`; // מפתח ייחודי לכל מכשיר

    // פונקציה לשמירת נתיב פירורי הלחם ב-sessionStorage
    function savePathTrailToStorage() {
        try {
            sessionStorage.setItem(BREADCRUMB_STORAGE_KEY, JSON.stringify(currentPathTrail));
        } catch (e) {
            console.warn("Could not save breadcrumb trail to session storage:", e);
        }
    }

    // פונקציה לשחזור נתיב פירורי הלחם מ-sessionStorage
    function loadPathTrailFromStorage() {
        try {
            const storedTrail = sessionStorage.getItem(BREADCRUMB_STORAGE_KEY);
            if (storedTrail) {
                return JSON.parse(storedTrail);
            }
        } catch (e) {
            console.warn("Could not load breadcrumb trail from session storage:", e);
        }
        return null;
    }

    // אתחול currentPathTrail
    const storedPath = loadPathTrailFromStorage();
    if (pathIdFromUrl) { // אם יש pathId ב-URL
        // currentObjectId כבר נקבע למעלה עם הערך המפוענח של pathIdFromUrl
        if (storedPath && storedPath.length > 0 && storedPath[storedPath.length - 1].id === currentObjectId) {
            // אם יש נתיב שמור והוא תואם ל-currentObjectId (שמגיע מ-pathIdFromUrl המפוענח)
            currentPathTrail = storedPath;
        } else {
            // אין נתיב שמור תואם, נבנה נתיב בסיסי
            currentPathTrail = [{ id: "0", title: "Root" }];
            if (currentObjectId !== "0") {
                // הערה: עדיין נשתמש ב-ID (המפוענח) כשם אם אין לנו דרך לקבל את השם האמיתי כאן
                // זה עדיף על הצגת ID מקודד.
                currentPathTrail.push({ id: currentObjectId, title: currentObjectId });
            }
            savePathTrailToStorage(); // שמירת הנתיב החדש שנבנה
        }
    } else { // אין pathId ב-URL (ולכן גם currentObjectId הוא "0")
        // currentObjectId כבר "0"
        if (storedPath && storedPath.length > 0 && storedPath[0].id === "0") {
            // אם יש נתיב שמור שמתחיל מהשורש, נשתמש בו (אולי המשתמש חזר אחורה)
            // נניח שהמשתמש רוצה את השורש אם אין pathId, אז נחתוך לשורש אם הנתיב השמור עמוק יותר
            currentPathTrail = [{ id: "0", title: "Root" }];
        } else {
            currentPathTrail = [{ id: "0", title: "Root" }];
        }
        savePathTrailToStorage(); // שמירת נתיב השורש
    }


    // פונקציה לעדכון ה-URL עם ה-ObjectID הנוכחי
    function updateUrl(objectId) {
        const newUrl = new URL(window.location.href);
        if (udn) {
            newUrl.searchParams.set('udn', udn); // ודא ש-udn נשאר
        }
        newUrl.searchParams.set('pathId', objectId);
        history.replaceState({ pathId: objectId }, '', newUrl.toString());
    }

    // פונקציה להצגת הודעת שגיאה בדפדפן
    function showError(message) {
        if (errorMessageArea) {
            errorMessageArea.textContent = message;
            errorMessageArea.style.display = 'block';
        }
        if (itemListContainer) {
            itemListContainer.innerHTML = ''; // נקה רשימת פריטים קיימת
        }
    }

    // פונקציה להסתרת הודעת שגיאה
    function clearError() {
        if (errorMessageArea) {
            errorMessageArea.textContent = '';
            errorMessageArea.style.display = 'none';
        }
    }

    // פונקציה להצגת הודעת סטטוס כללית
    function showStatusMessage(message, type = 'info') { // type can be 'success', 'error', or 'info'
        if (statusMessageArea) {
            statusMessageArea.textContent = message;
            statusMessageArea.className = `status-message ${type}`; // Reset classes and add new ones
            statusMessageArea.style.display = 'block';
            setTimeout(() => {
                if (statusMessageArea) {
                    statusMessageArea.style.display = 'none';
                }
            }, 5000); // הסתר הודעה אחרי 5 שניות
        }
    }

    // פונקציה להצגת הודעת סטטוס בתוך המודאל
    function showModalStatusMessage(message, type = 'info') {
        if (modalStatusMessage) {
            modalStatusMessage.textContent = message;
            modalStatusMessage.className = `status-message ${type}`;
            modalStatusMessage.style.display = 'block';
        }
    }


    // פונקציה לטעינת התקני רינדור
    async function loadRenderers() {
        if (renderersLoaded) return true; // אם כבר נטען, אל תטען שוב

        showModalStatusMessage('Loading rendering devices...', 'info');
        if (rendererSelect) {
            rendererSelect.innerHTML = '<option value="">Loading...</option>'; // הצג הודעת טעינה ב-select
        }

        try {
            const response = await fetch('/api/devices');
            if (!response.ok) {
                throw new Error(`Failed to fetch devices: ${response.status}`);
            }
            const devices = await response.json();
            availableRenderers = devices
                .filter(device => {
                    // המבנה החדש: device.serviceList הוא אובייקט של שירותים
                    if (device.serviceList && typeof device.serviceList === 'object') {
                        for (const serviceKey in device.serviceList) {
                            const service = device.serviceList[serviceKey];
                            if (service && service.serviceType === 'urn:schemas-upnp-org:service:AVTransport:1') {
                                return true; // מצאנו שירות AVTransport
                            }
                        }
                    }
                    return false; // לא נמצא שירות AVTransport
                })
                .map(device => ({
                    udn: device.UDN, // שימוש ב-UDN כפי שמוחזר מהשרת
                    friendlyName: device.friendlyName || 'Unknown Renderer'
                }));

            renderersLoaded = true;
            populateRendererSelect();
            if (availableRenderers.length === 0) {
                showModalStatusMessage('No rendering devices found.', 'info');
            } else {
                if (modalStatusMessage) {
                    modalStatusMessage.style.display = 'none'; // הסתר הודעת טעינה אם יש מכשירים
                }
            }
            return true;
        } catch (error) {
            console.error('Error loading renderers:', error);
            showModalStatusMessage(`Error loading devices: ${error.message}`, 'error');
            if (rendererSelect) {
                rendererSelect.innerHTML = '<option value="">Error loading</option>';
            }
            renderersLoaded = false; // אפשר ניסיון טעינה חוזר
            return false;
        }
    }

    // פונקציה לאכלוס ה-select עם התקני הרינדור
    function populateRendererSelect() {
        if (rendererSelect) {
            rendererSelect.innerHTML = ''; // נקה אפשרויות קיימות
            if (availableRenderers.length === 0) {
                rendererSelect.innerHTML = '<option value="">No rendering devices found</option>';
                if (confirmPlayButton) {
                    confirmPlayButton.disabled = true;
                }
                return;
            }
            availableRenderers.forEach(renderer => {
                const option = document.createElement('option');
                option.value = renderer.udn;
                option.textContent = renderer.friendlyName;
                rendererSelect.appendChild(option);
            });
            if (confirmPlayButton) {
                confirmPlayButton.disabled = false;
            }
        }
    }


    // פונקציות לניהול מציג המדיה הוסרו


    // פונקציות לטיפול בסוגי מדיה שונים הוסרו, המדיה תיפתח בכרטיסייה חדשה


    if (!udn) {
        showError('Error: UDN parameter is missing from the URL.');
        if (deviceTitleElement) deviceTitleElement.textContent = 'Error: No Device UDN';
        return;
    }

    if (deviceTitleElement) deviceTitleElement.textContent = `Browsing Device: ${udn}`; // בשלב זה נציג את ה-UDN

    // פונקציה לטעינת ועיבוד תוכן
    async function loadAndDisplayContent(objectId) { // objectId יגיע מההיגיון הקורא
        clearError();
        if (itemListContainer) itemListContainer.innerHTML = '<li>Loading...</li>'; // הצג הודעת טעינה
        currentObjectId = objectId; // עדכון ה-ID הגלובלי של התיקייה הנוכחית

        try {
            const response = await fetch(`/api/devices/${udn}/browse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ObjectID: objectId,
                    BrowseFlag: "BrowseDirectChildren",
                    RequestedCount: 50, // אפשר לשנות את הערך הזה
                    Filter: "*", // בקש את כל המאפיינים
                    StartingIndex: 0, // התחל מהאינדקס הראשון
                    SortCriteria: "" // ללא מיון מיוחד בשלב זה
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.message || `Failed to browse device. Status: ${response.status}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            const items = result.items; // המערך של הפריטים נמצא תחת המפתח items

            if (!Array.isArray(items)) {
                console.error("Expected 'Result' to be an array, but got:", items);
                throw new Error("Invalid data format received from server. 'Result' is not an array.");
            }

            displayItems(items);
            updateBreadcrumbs();
            updateUrl(objectId); // עדכון ה-URL לאחר טעינה מוצלחת ועדכון פירורי לחם
            savePathTrailToStorage(); // שמירת הנתיב לאחר כל טעינה מוצלחת

        } catch (error) {
            console.error('Error fetching or processing content:', error);
            showError(`Error: ${error.message}`);
        }
    }

    // פונקציה לניווט לתיקייה חדשה
    function navigateToFolder(folderIdFromItem, folderTitle) {
        // folderIdFromItem מגיע מ-item.id. נניח שהוא כבר מקודד URL אם כך השרת מחזיר אותו.
        // ודא שהוא מחרוזת.
        let actualFolderId = folderIdFromItem;
        if (Array.isArray(folderIdFromItem) && folderIdFromItem.length > 0) {
            actualFolderId = folderIdFromItem[0];
        } else if (Array.isArray(folderIdFromItem)) {
            console.error("Received empty array as folderId from item, cannot navigate.");
            return;
        }

        if (typeof actualFolderId !== 'string') {
            console.error("folderId from item is not a string after processing array:", actualFolderId);
            return;
        }

        // actualFolderId הוא ה-ID המקודד (כפי שמגיע מהשרת/URL)
        const existingSegmentIndex = currentPathTrail.findIndex(segment => segment.id === actualFolderId);
        if (existingSegmentIndex !== -1 && existingSegmentIndex < currentPathTrail.length - 1) {
            currentPathTrail = currentPathTrail.slice(0, existingSegmentIndex + 1);
        } else if (existingSegmentIndex === -1) {
            // שמור את ה-ID המקודד, ואת ה-title הלא מקודד
            currentPathTrail.push({ id: actualFolderId, title: folderTitle });
        }

        loadAndDisplayContent(actualFolderId); // שלח ID מקודד לשרת
        // updateUrl ו-savePathTrailToStorage יקרו בתוך loadAndDisplayContent לאחר הצלחה
    }

    // פונקציה לטיפול בלחיצה על פירור לחם
    function handleBreadcrumbClick(segmentIndex) {
        const clickedSegment = currentPathTrail[segmentIndex];
        currentPathTrail = currentPathTrail.slice(0, segmentIndex + 1);
        // אין צורך לשמור כאן במפורש, כי loadAndDisplayContent יעשה זאת
        loadAndDisplayContent(clickedSegment.id);
        // updateUrl ו-savePathTrailToStorage יקרו בתוך loadAndDisplayContent לאחר הצלחה
    }

    // פונקציה להצגת הפריטים
    function displayItems(items) {
        if (itemListContainer) itemListContainer.innerHTML = ''; // נקה תוכן קודם או הודעת טעינה
        /** @type {HTMLElement | null} */
        const folderActionsContainer = document.getElementById('folder-actions-container');
        if (folderActionsContainer) folderActionsContainer.innerHTML = ''; // נקה כפתורים קודמים של התיקייה
        let hasVideoItems = false;


        if (items.length === 0) {
            if (itemListContainer) itemListContainer.innerHTML = '<li>No items found in this location.</li>';
            return;
        }

        items.forEach(item => {
            const listItem = document.createElement('li');

            const iconSpan = document.createElement('span');
            iconSpan.className = 'item-icon';
            // קביעת אייקון בסיסי
            if (item['upnp:class'] && item['upnp:class'].startsWith('object.container')) {
                iconSpan.textContent = '📁'; // אייקון תיקייה
            } else if (item['upnp:class'] && item['upnp:class'].startsWith('object.item.imageItem')) {
                iconSpan.textContent = '🖼️'; // אייקון תמונה
            } else if (item['upnp:class'] && item['upnp:class'].startsWith('object.item.audioItem')) {
                iconSpan.textContent = '🎵'; // אייקון שמע
            } else if (item['upnp:class'] && item['upnp:class'].startsWith('object.item.videoItem')) {
                iconSpan.textContent = '🎬'; // אייקון וידאו
                hasVideoItems = true; // סמן שיש פריט וידאו
            } else {
                iconSpan.textContent = '📄'; // אייקון קובץ כללי
            }
            listItem.appendChild(iconSpan);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'item-title';
            titleSpan.textContent = item['dc:title'] || 'Untitled';
            listItem.appendChild(titleSpan);

            const detailsSpan = document.createElement('span');
            detailsSpan.className = 'item-details';

            let detailsText = `(Class: ${item['upnp:class'] || 'N/A'})`;

            if (item['upnp:class'] && item['upnp:class'].startsWith('object.container')) {
                titleSpan.classList.add('container-title');
                titleSpan.setAttribute('data-id', item.id); // שמירת ה-ID של התיקייה
                titleSpan.setAttribute('data-title', item['dc:title'] || 'Untitled'); // שמירת שם התיקייה
                // הוספת event listener ללחיצה על שם התיקייה
                titleSpan.addEventListener('click', (event) => {
                    event.preventDefault(); // מניעת פעולת ברירת מחדל אם זה היה קישור אמיתי
                    navigateToFolder(item.id, item['dc:title'] || 'Untitled'); // item.id הוא כנראה מקודד
                });
                detailsText += ` (ID: ${decodeURI(Array.isArray(item.id) ? item.id.join(',') : item.id)})`;
            } else if (item['upnp:class'] && item['upnp:class'].startsWith('object.item')) { // זהו item
                const itemClass = item['upnp:class'];
                let resourceUrl = null;

                if (item.res && typeof item.res === 'string') {
                    resourceUrl = item.res;
                } else if (item.res && item.res._) {
                    resourceUrl = item.res._;
                } else if (Array.isArray(item.resources) && item.resources.length > 0 && item.resources[0]._) {
                    resourceUrl = item.resources[0]._;
                }

                if (resourceUrl) {
                    detailsText += ` | Resource available`;
                    const actionsSpan = document.createElement('span');
                    actionsSpan.className = 'item-actions';
                    let actionLink;

                    if (itemClass.includes('imageItem')) {
                        actionLink = document.createElement('a');
                        actionLink.textContent = 'View';
                        actionLink.href = resourceUrl;
                        actionLink.target = '_blank';
                        actionsSpan.appendChild(actionLink); // הוסף את הקישור ישירות
                    } else if (itemClass.includes('audioItem')) {
                        actionLink = document.createElement('a');
                        actionLink.textContent = 'Play';
                        actionLink.href = resourceUrl;
                        actionLink.target = '_blank';
                        actionsSpan.appendChild(actionLink); // הוסף את הקישור ישירות
                    } else if (itemClass.includes('videoItem')) {
                        actionLink = document.createElement('a');
                        actionLink.textContent = 'Play';
                        actionLink.href = resourceUrl;
                        actionLink.target = '_blank';
                        actionsSpan.appendChild(actionLink);
    
                        const playToButton = document.createElement('a');
                        playToButton.textContent = 'Play To...';
                        playToButton.href = '#';
                        playToButton.style.marginLeft = '10px';
                        playToButton.style.backgroundColor = '#17a2b8';
                        playToButton.addEventListener('click', (event) => {
                            event.preventDefault();
                            currentVideoItemForPlayTo = item;
                            // playAllModeActive הוסר
                            handlePlayToClick(false); // false מציין שזה לא Play All
                        });
                        actionsSpan.appendChild(playToButton);
                    }
    
                    if (actionsSpan.hasChildNodes()) {
                        listItem.appendChild(actionsSpan);
                    }
    
                } else {
                    detailsText += ` | No playable/viewable resource URL found`;
                }
            }
            detailsSpan.textContent = detailsText;
            listItem.appendChild(detailsSpan);
    
            if (itemListContainer) itemListContainer.appendChild(listItem);
        });

        // הוספת כפתור "Play All To..." אם יש פריטי וידאו והתיקייה אינה השורש
        if (hasVideoItems && currentObjectId !== "0") { // רק אם יש פריטי וידאו ולא בשורש
            const playAllButton = document.createElement('button');
            playAllButton.id = 'play-all-button';
            playAllButton.textContent = 'Play All To...';
            playAllButton.style.marginBottom = '10px'; // מרווח מתחת לכפתור
            playAllButton.style.padding = '10px 15px';
            playAllButton.style.backgroundColor = '#007bff';
            playAllButton.style.color = 'white';
            playAllButton.style.border = 'none';
            playAllButton.style.borderRadius = '4px';
            playAllButton.style.cursor = 'pointer';
            playAllButton.addEventListener('click', () => {
                // playAllModeActive הוסר
                handlePlayToClick(true); // true מציין שזה Play All
            });
            if (folderActionsContainer) folderActionsContainer.appendChild(playAllButton); // הוסף לקונטיינר הייעודי
        }
    }
    
    
    // פונקציה לטיפול בלחיצה על "Play To..." או "Play All To..."
    // הפרמטר isPlayAll מציין אם הלחיצה הגיעה מכפתור "Play All"
    async function handlePlayToClick(isPlayAll) {
        if (modalStatusMessage) modalStatusMessage.style.display = 'none';
        if (rendererModal) {
            rendererModal.style.display = 'block';
            // שמירת מצב ה-Play All כדי שיהיה זמין באירוע הלחיצה על confirm
            rendererModal.dataset.isPlayAll = String(isPlayAll);
        }
        const success = await loadRenderers();
        if (success) {
            populateRendererSelect();
        }
    }
    
    // פונקציה לשליחת בקשת הניגון (קובץ בודד)
    async function sendPlayRequest(rendererUdn, mediaServerUdn, objectID) {
        const selectedRenderer = availableRenderers.find(r => r.udn === rendererUdn);
        const rendererName = selectedRenderer ? selectedRenderer.friendlyName : 'selected device';
    
        showStatusMessage(`Sending video to ${rendererName}...`, 'info');
        if (rendererModal) rendererModal.style.display = 'none';
    
        try {
            const response = await fetch(`/api/renderers/${rendererUdn}/play`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mediaServerUdn: mediaServerUdn,
                    objectID: objectID
                }),
            });
    
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.message || `Failed to send play command. Status: ${response.status}`);
            }
    
            const result = await response.json();
            if (result.success) {
                showStatusMessage(`Video sent successfully to ${rendererName}.`, 'success');
            } else {
                throw new Error(result.message || 'Playback command was not successful.');
            }
    
        } catch (error) {
            console.error('Error sending play request:', error);
            showStatusMessage(`Error sending video to ${rendererName}: ${error.message}`, 'error');
        }
    }

    // פונקציה לשליחת בקשת ניגון תיקייה
    async function sendPlayFolderRequest(rendererUdn, mediaServerUdn, folderObjectID) {
        const selectedRenderer = availableRenderers.find(r => r.udn === rendererUdn);
        const rendererName = selectedRenderer ? selectedRenderer.friendlyName : 'selected device';

        showStatusMessage(`Sending folder to ${rendererName}...`, 'info');
        if (rendererModal) rendererModal.style.display = 'none';

        try {
            const response = await fetch(`/api/renderers/${rendererUdn}/play-folder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mediaServerUdn: mediaServerUdn,
                    folderObjectID: folderObjectID
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
                throw new Error(errorData.message || `Failed to send play folder command. Status: ${response.status}`);
            }

            const result = await response.json();
            if (result.success) {
                showStatusMessage(`Folder sent successfully to ${rendererName}.`, 'success');
            } else {
                throw new Error(result.message || 'Play folder command was not successful.');
            }

        } catch (error) {
            console.error('Error sending play folder request:', error);
            showStatusMessage(`Error sending folder to ${rendererName}: ${error.message}`, 'error');
        }
    }
    
    // Event listeners for modal buttons
    if (confirmPlayButton) {
        confirmPlayButton.addEventListener('click', () => {
            const selectedRendererUdn = rendererSelect?.value;
            if (!selectedRendererUdn) {
                showModalStatusMessage('Please select a device.', 'error');
                return;
            }

            const mediaServerUdn = udn; // UDN של שרת המדיה הנוכחי (מה-URL)
            const isPlayAll = rendererModal?.dataset.isPlayAll === 'true'; // קריאת המצב מה-dataset

        if (isPlayAll) {
            // מצב "Play All To..."
            const folderObjectID = currentObjectId; // ה-ID של התיקייה הנוכחית
            if (!folderObjectID || folderObjectID === "0") {
                showModalStatusMessage('Error: Cannot play all from root or invalid folder ID.', 'error');
                console.error("Invalid folderObjectID for Play All:", folderObjectID);
                return;
            }
            sendPlayFolderRequest(selectedRendererUdn, mediaServerUdn, folderObjectID);
        } else {
            // מצב "Play To..." (קובץ בודד)
            if (!currentVideoItemForPlayTo || !currentVideoItemForPlayTo.id) {
                showModalStatusMessage('Error: No video item selected or item has no ID.', 'error');
                console.error("currentVideoItemForPlayTo or its ID is missing", currentVideoItemForPlayTo);
                return;
            }
        
            let objectIdForPlay;
            if (Array.isArray(currentVideoItemForPlayTo.id)) {
                objectIdForPlay = currentVideoItemForPlayTo.id[0];
            } else {
                objectIdForPlay = currentVideoItemForPlayTo.id;
            }
            
            if (!objectIdForPlay) {
                 showModalStatusMessage('Error: Video item ID is invalid.', 'error');
                 console.error("Video item ID is invalid after processing", currentVideoItemForPlayTo.id);
                 return;
            }
            sendPlayRequest(selectedRendererUdn, mediaServerUdn, objectIdForPlay);
        }
        // אין צורך לאפס את playAllModeActive כי הוא כבר לא משתנה גלובלי
    });
    
    }
    if (cancelPlayButton) {
        cancelPlayButton.addEventListener('click', () => {
            if (rendererModal) rendererModal.style.display = 'none';
            if (modalStatusMessage) modalStatusMessage.style.display = 'none'; // נקה הודעות מודאל ביציאה
        });
    }
    
    // סגירת המודאל בלחיצה מחוץ לתוכן שלו
    window.onclick = function(event) {
        if (event.target === rendererModal) {
            if (rendererModal) rendererModal.style.display = "none";
            if (modalStatusMessage) modalStatusMessage.style.display = 'none';
        }
    }
    
    
    // פונקציה לעדכון פירורי הלחם
    function updateBreadcrumbs() {
        if (breadcrumbsContainer) {
            breadcrumbsContainer.innerHTML = ''; // נקה פירורי לחם קיימים

            currentPathTrail.forEach((segment, index) => {
                const span = document.createElement('span');
                if (index < currentPathTrail.length - 1) {
                    // זה לא הסגמנט האחרון, אז הוא יהיה קישור
                    const anchor = document.createElement('a');
                    anchor.href = "#";
                    anchor.textContent = segment.title;
                    // הוספת event listener ללחיצה על פירור לחם
                    anchor.addEventListener('click', (event) => {
                        event.preventDefault();
                        handleBreadcrumbClick(index);
                    });
                    span.appendChild(anchor);
                    span.appendChild(document.createTextNode(' > '));
                } else {
                    // זה הסגמנט האחרון, אז הוא טקסט רגיל
                    span.textContent = segment.title;
                }
                breadcrumbsContainer.appendChild(span);
            });
        }
    }

    // טעינת תוכן ראשוני
    // currentObjectId ו-currentPathTrail כבר אותחלו למעלה
    updateBreadcrumbs(); // עדכון ראשוני של פירורי הלחם על בסיס מה ששוחזר/נבנה
    loadAndDisplayContent(currentObjectId);
    // updateUrl ו-savePathTrailToStorage יקרו בתוך loadAndDisplayContent
});