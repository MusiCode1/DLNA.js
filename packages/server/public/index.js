// @ts-check
// פונקציה לשליפת ועדכון רשימת המכשירים
async function fetchDevices() {
    /** @type {HTMLElement | null} */
    const deviceListElement = document.getElementById('device-list');
    /** @type {HTMLElement | null} */
    const errorMessageElement = document.getElementById('error-message');
    
    // הסתרת הודעת שגיאה בתחילת כל קריאה
    if (errorMessageElement) {
        errorMessageElement.style.display = 'none';
        errorMessageElement.textContent = '';
    }

    try {
        const response = await fetch('/api/devices');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const devices = await response.json();
        
        // ניקוי הרשימה הקיימת
        if (deviceListElement) {
            deviceListElement.innerHTML = '';
        }

        if (devices.length === 0) {
            const listItem = document.createElement('li');
            listItem.textContent = 'No devices found.';
            if (deviceListElement) {
                deviceListElement.appendChild(listItem);
            }
        } else {
            devices.forEach(device => {
                const listItem = document.createElement('li'); // Main li element

                const deviceInfoContainer = document.createElement('div');
                deviceInfoContainer.className = 'device-info-container';

                // יצירת אלמנט תמונה אם קיים URL ללוגו
                // שונה להתאים ל-iconList מהשרת
                if (device.iconList && device.iconList.length > 0 && device.iconList[0].url) {
                    const img = document.createElement('img');
                    img.src = device.iconList[0].url; // שימוש באייקון הראשון מהרשימה
                    img.alt = device.friendlyName + ' logo';
                    deviceInfoContainer.appendChild(img);
                }
                
                // הוספת הטקסט של שם המכשיר
                const textNode = document.createTextNode(`${device.friendlyName} (${device.modelName || 'N/A'})`);
                deviceInfoContainer.appendChild(textNode);

                // הצגת קישור למסמך הראשי של ההתקן
                // שונה להתאים ל-presentationURL מהשרת
                if (device.presentationURL) {
                    const presentationLink = document.createElement('a');
                    presentationLink.href = device.presentationURL; // שימוש ב-presentationURL
                    presentationLink.textContent = 'Open Device Page';
                    presentationLink.target = '_blank'; // פתיחה בלשונית חדשה
                    presentationLink.style.marginLeft = '10px'; // מרווח קטן משמאל
                    presentationLink.className = 'browse-button'; // שימוש באותו עיצוב כמו כפתור העיון
                    deviceInfoContainer.appendChild(presentationLink);
                }

                // הצגת כפתור Browse רק אם שירות ContentDirectory קיים
                // serviceList הוא עכשיו אובייקט
                if (device.serviceList && device.serviceList['ContentDirectory'] && device.serviceList['ContentDirectory'].serviceType === 'urn:schemas-upnp-org:service:ContentDirectory:1') {
                    const browseButton = document.createElement('a');
                    browseButton.href = 'browser.html?udn=' + device.UDN; // שימוש ב-UDN (אותיות גדולות)
                    browseButton.textContent = 'Browse';
                    browseButton.className = 'browse-button'; // Apply CSS class
                    deviceInfoContainer.appendChild(browseButton);
                }

                // הצגת כפתור "שליטה" אם שירות AVTransport קיים
                if (device.serviceList && device.serviceList['AVTransport']) {
                    const controlButton = document.createElement('a');
                    controlButton.href = 'renderer_control.html?udn=' + device.UDN;
                    controlButton.textContent = 'שליטה';
                    controlButton.className = 'browse-button'; // שימוש באותו עיצוב
                    controlButton.style.marginLeft = '10px';
                    deviceInfoContainer.appendChild(controlButton);
                }
                
                listItem.appendChild(deviceInfoContainer);

                // הצגת רשימת השירותים מתוך serviceList (שהוא אובייקט)
                if (device.serviceList && Object.keys(device.serviceList).length > 0) {
                    const servicesContainer = document.createElement('div');
                    servicesContainer.className = 'services-container';
                    const servicesTitle = document.createElement('h4'); // הוספת כותרת לרשימת השירותים
                    servicesTitle.textContent = 'Services:';
                    servicesTitle.style.marginTop = '10px';
                    servicesTitle.style.marginBottom = '5px';
                    servicesContainer.appendChild(servicesTitle);
                    
                    const servicesListElement = document.createElement('ul');
                    servicesListElement.className = 'services-list-inline'; // הוספת הקלאס החדש
                    Object.keys(device.serviceList).forEach(serviceId => {
                        const serviceItem = document.createElement('li');
                        serviceItem.textContent = serviceId; // מציג את מזהה השירות
                        // אם רוצים להציג פרטים נוספים מהאובייקט של השירות:
                        // const serviceDetails = device.serviceList[serviceId];
                        // serviceItem.textContent = `${serviceId} (Control URL: ${serviceDetails.controlURL})`;
                        servicesListElement.appendChild(serviceItem);
                    });
                    servicesContainer.appendChild(servicesListElement);
                    listItem.appendChild(servicesContainer);
                }
                
                if (deviceListElement) {
                    deviceListElement.appendChild(listItem);
                }
            });
        }
    } catch (error) {
        console.error('Error fetching devices:', error);
        if (errorMessageElement) {
            errorMessageElement.textContent = 'Error fetching devices. Please check the server.';
            errorMessageElement.style.display = 'block'; // הצגת הודעת השגיאה
        }
        // מנקה את הרשימה במקרה של שגיאה כדי לא להציג מידע ישן
        if (deviceListElement) {
            deviceListElement.innerHTML = '';
        }
    }
}

// טעינה ראשונית של המכשירים
fetchDevices();

// רענון הרשימה כל 5 שניות
setInterval(fetchDevices, 5000);