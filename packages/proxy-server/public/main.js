document.addEventListener('DOMContentLoaded', () => {
    const tvList = [
        ['192.168.1.41', 'e6d865a8129fc69d17db75829985ad14', 'מרתף'],
        ['192.168.1.42', '7971b54a460430a87ed9207ed314cada', 'חדר שינה']
    ];

    const tvSelect = document.getElementById('tv-select');
    const connectBtn = document.getElementById('connect-btn');
    const controlsDiv = document.getElementById('controls');
    const statusDiv = document.getElementById('status');
    let ws = null;

    // אכלוס תיבת הבחירה
    tvList.forEach(tv => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ ip: tv[0], clientKey: tv[1] });
        option.textContent = tv[2] || tv[0]; // הצג שם אם קיים, אחרת IP
        tvSelect.appendChild(option);
    });

    // התחברות לשרת
    connectBtn.addEventListener('click', () => {
        if (ws) {
            ws.close();
        }

        const selectedTv = tvSelect.value;
        if (!selectedTv) {
            updateStatus('נא לבחור טלוויזיה להתחברות.');
            return;
        }

        const { ip, clientKey } = JSON.parse(selectedTv);
        const wsProtocol = (window.location.protocol === 'http:') ? 'ws' : 'wss';
        const wsUrl = `${wsProtocol}://${window.location.host}/ws?ip=${ip}&clientKey=${clientKey}`;

        updateStatus(`מתחבר לטלוויזיה בכתובת ${ip}...`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateStatus(`מחובר לטלוויזיה: ${ip}`);
            controlsDiv.style.display = 'block';
        };

        ws.onmessage = (event) => {
            const message = event.data;
            console.log('Message from server:', message);
            updateStatus(`הודעה מהשרת: ${message}`);
        };

        ws.onclose = () => {
            updateStatus('החיבור נסגר.');
            controlsDiv.style.display = 'none';
            ws = null;
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('שגיאת WebSocket. בדוק את המסוף לפרטים.');
            controlsDiv.style.display = 'none';
        };
    });

    // הוספת מאזיני אירועים לכפתורי הפקודה
    controlsDiv.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON' && ws && ws.readyState === WebSocket.OPEN) {
            const commandStr = event.target.getAttribute('data-command');
            if (commandStr) {
                const command = JSON.parse(commandStr);
                ws.send(JSON.stringify(command));
                updateStatus(`פקודה נשלחה: ${command.type} - ${command.uri || command.name}`);
            }
        }
    });

    // טיפול מיוחד בכפתור הצגת הודעה
    const showToastBtn = document.getElementById('show-toast-btn');
    showToastBtn.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = prompt("הקלד את ההודעה להצגה על הטלוויזיה:");
            if (message) {
                const command = {
                    type: 'request',
                    uri: 'ssap://system.notifications/createToast',
                    payload: { message: message }
                };
                ws.send(JSON.stringify(command));
                updateStatus(`הודעה נשלחה: "${message}"`);
            }
        }
    });

    function updateStatus(message) {
        statusDiv.textContent = message;
    }
});