# תכנית שדרוג ממשק השלט הרחוק - הוספת בחירה מרשימת טלוויזיות

## מטרה
שדרוג ממשק השלט הרחוק כך שיתמוך בשתי דרכים להתחברות לטלוויזיה:
1. הזנה ידנית של IP ומפתח (קיים)
2. בחירה מרשימה של טלוויזיות מוגדרות מראש מהקובץ `tv-list.json`

## קבצים לעדכון
- `drafts/remote-control/index.html` - שינויי ממשק משתמש
- `drafts/remote-control/index.js` - לוגיקת טעינה ובחירה
- `drafts/remote-control/client.js` - ללא שינוי

## שינויים מפורטים

### 1. index.html

#### 1.1 החלפת אזור ההתחברות הקיים (שורות 190-200)
```html
<div class="card">
    <h2>התחברות</h2>
    
    <!-- כפתורי בחירת שיטת התחברות -->
    <div class="connection-type-selector">
        <label class="radio-button">
            <input type="radio" name="connection-type" value="manual" checked>
            <span>הזנה ידנית</span>
        </label>
        <label class="radio-button">
            <input type="radio" name="connection-type" value="list">
            <span>בחירה מרשימה</span>
        </label>
    </div>

    <!-- טופס הזנה ידנית -->
    <div id="manual-connection" class="connection-form">
        <div class="input-group">
            <input type="text" id="tv-ip" placeholder="הכנס כתובת IP של הטלוויזיה">
            <input type="text" id="client-key" placeholder="מפתח לקוח (אופציונלי)">
        </div>
    </div>

    <!-- טופס בחירה מרשימה -->
    <div id="list-connection" class="connection-form" style="display: none;">
        <div class="input-group">
            <select id="tv-select" class="tv-select">
                <option value="">בחר טלוויזיה...</option>
            </select>
        </div>
        <!-- פרטי הטלוויזיה הנבחרת -->
        <div id="selected-tv-details" class="tv-details" style="display: none;">
            <div class="detail-row">
                <span class="detail-label">שם:</span>
                <span class="detail-value" id="selected-tv-name"></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">IP:</span>
                <span class="detail-value" id="selected-tv-ip"></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">MAC:</span>
                <span class="detail-value" id="selected-tv-mac"></span>
            </div>
        </div>
    </div>

    <div class="input-group">
        <button id="connect-btn">התחבר</button>
    </div>

    <p><strong>הערה:</strong> אם זו הפעם הראשונה, יש לאשר את החריגה האבטחתית בדפדפן. 
        <a id="cert-link" href="#" target="_blank" style="display: none;">פתח קישור לאישור תעודה</a>.</p>
    <div id="status" class="status disconnected">לא מחובר</div>
</div>
```

#### 1.2 הוספת סגנונות CSS (בתוך תגית ה-style, אחרי הסגנונות הקיימים)
```css
.connection-type-selector {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    justify-content: center;
    flex-wrap: wrap;
}

.radio-button {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 10px 20px;
    border-radius: 20px;
    background-color: #f0f2f5;
    transition: background-color 0.2s, box-shadow 0.2s;
    user-select: none;
}

.radio-button:hover {
    background-color: #e4e6eb;
}

.radio-button input[type="radio"]:checked + span {
    font-weight: bold;
}

.radio-button:has(input[type="radio"]:checked) {
    background-color: #e7f3ff;
    box-shadow: 0 0 0 2px #1877f2;
}

.radio-button input[type="radio"] {
    margin: 0;
    cursor: pointer;
}

.connection-form {
    transition: opacity 0.3s ease-in-out;
}

.tv-select {
    width: 100%;
    padding: 10px;
    border: 1px solid #dddfe2;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
}

.tv-select:focus {
    outline: none;
    border-color: #1877f2;
    box-shadow: 0 0 0 2px rgba(24, 119, 242, 0.2);
}

.tv-details {
    margin-top: 15px;
    padding: 15px;
    background-color: #f7f8fa;
    border-radius: 6px;
    border: 1px solid #dddfe2;
    animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-5px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.detail-row {
    display: flex;
    margin-bottom: 8px;
    align-items: center;
}

.detail-row:last-child {
    margin-bottom: 0;
}

.detail-label {
    font-weight: 600;
    min-width: 80px;
    color: #1c1e21;
}

.detail-value {
    color: #65676b;
    font-family: 'Courier New', monospace;
}
```

### 2. index.js

#### 2.1 הוספת משתנה גלובלי למעקב אחר רשימת הטלוויזיות
```javascript
let tvListData = [];
```

#### 2.2 הוספת פונקציות טעינה וניהול הרשימה (לפני ה-DOMContentLoaded)
```javascript
// טעינת רשימת הטלוויזיות מהשרת או מ-localStorage
async function loadTVList() {
    try {
        // ננסה לטעון את הקובץ מיחסית לנתיב הנוכחי
        const response = await fetch('../../packages/proxy-server/public/tv-list.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tvList = await response.json();
        localStorage.setItem('tv-list', JSON.stringify(tvList));
        localStorage.setItem('tv-list-timestamp', Date.now().toString());
        return tvList;
    } catch (error) {
        console.error('Error loading TV list from server:', error);
        // ננסה לטעון מ-localStorage אם קיים
        const cached = localStorage.getItem('tv-list');
        if (cached) {
            console.log('Using cached TV list');
            return JSON.parse(cached);
        }
        console.warn('No TV list available');
        return [];
    }
}

// אתחול הרשימה הנגללת
async function initializeTVSelect() {
    const select = document.getElementById('tv-select');
    tvListData = await loadTVList();
    
    if (tvListData.length === 0) {
        select.innerHTML = '<option value="">לא נמצאו טלוויזיות</option>';
        select.disabled = true;
        return;
    }
    
    select.innerHTML = '<option value="">בחר טלוויזיה...</option>' +
        tvListData.map(tv => `<option value="${tv.name}">${tv.name}</option>`).join('');
    
    select.addEventListener('change', () => updateSelectedTVDetails());
    
    // אם יש בחירה שמורה, נטען אותה
    const savedSelection = localStorage.getItem('selected-tv-name');
    if (savedSelection && tvListData.find(tv => tv.name === savedSelection)) {
        select.value = savedSelection;
        updateSelectedTVDetails();
    }
}

// עדכון פרטי הטלוויזיה הנבחרת
function updateSelectedTVDetails() {
    const select = document.getElementById('tv-select');
    const details = document.getElementById('selected-tv-details');
    const selectedTV = tvListData.find(tv => tv.name === select.value);
    
    if (selectedTV) {
        document.getElementById('selected-tv-name').textContent = selectedTV.name;
        document.getElementById('selected-tv-ip').textContent = selectedTV.ip;
        document.getElementById('selected-tv-mac').textContent = selectedTV['mac-address'];
        details.style.display = 'block';
        
        // שמירת הבחירה
        localStorage.setItem('selected-tv-name', selectedTV.name);
        
        // עדכון קישור התעודה
        certLink.href = `https://${selectedTV.ip}:3001`;
        certLink.style.display = 'inline';
    } else {
        details.style.display = 'none';
        localStorage.removeItem('selected-tv-name');
    }
}

// ניהול מעבר בין שיטות התחברות
function initializeConnectionTypeSwitching() {
    const radios = document.getElementsByName('connection-type');
    const manualForm = document.getElementById('manual-connection');
    const listForm = document.getElementById('list-connection');
    
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'manual') {
                manualForm.style.display = 'block';
                listForm.style.display = 'none';
                updateCertLink(); // עדכון קישור לפי IP ידני
            } else {
                manualForm.style.display = 'none';
                listForm.style.display = 'block';
                updateSelectedTVDetails(); // עדכון קישור לפי בחירה מהרשימה
            }
            localStorage.setItem('preferred-connection-type', e.target.value);
        });
    });
    
    // טעינת ההעדפה האחרונה
    const preferred = localStorage.getItem('preferred-connection-type');
    if (preferred && preferred === 'list') {
        const radio = document.querySelector('input[name="connection-type"][value="list"]');
        if (radio) {
            radio.checked = true;
            manualForm.style.display = 'none';
            listForm.style.display = 'block';
        }
    }
}
```

#### 2.3 עדכון פונקציית ההתחברות בתוך ה-DOMContentLoaded
להחליף את:
```javascript
connectBtn.addEventListener('click', () => {
    const ip = tvIpInput.value.trim();
    const key = clientKeyInput.value.trim();
    if (!ip) {
        alert("אנא הכנס כתובת IP.");
        return;
    }
    remote.connect(ip, key);
});
```

ב:
```javascript
connectBtn.addEventListener('click', () => {
    const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
    let ip, key;
    
    if (connectionType === 'manual') {
        ip = tvIpInput.value.trim();
        key = clientKeyInput.value.trim();
        if (!ip) {
            alert("אנא הכנס כתובת IP.");
            return;
        }
    } else {
        const select = document.getElementById('tv-select');
        const selectedTV = tvListData.find(tv => tv.name === select.value);
        if (!selectedTV) {
            alert("אנא בחר טלוויזיה מהרשימה.");
            return;
        }
        ip = selectedTV.ip;
        key = selectedTV['secert-key'];
        
        // עדכון השדות הידניים למקרה שהמשתמש ירצה לעבור להזנה ידנית
        tvIpInput.value = ip;
        clientKeyInput.value = key;
    }
    
    remote.connect(ip, key);
});
```

#### 2.4 הוספת קריאות לפונקציות החדשות בתחילת ה-DOMContentLoaded
אחרי השורה `const remote = new WebOSRemoteClient();` להוסיף:
```javascript
// אתחול רכיבי הבחירה
initializeConnectionTypeSwitching();
initializeTVSelect();
```

## סדר הביצוע המומלץ

1. עדכון index.html:
   - החלפת אזור ההתחברות (שורות 190-200)
   - הוספת סגנונות CSS בתוך תגית ה-style

2. עדכון index.js:
   - הוספת משתנה tvListData בראש הקובץ
   - הוספת הפונקציות החדשות לפני ה-DOMContentLoaded
   - עדכון פונקציית ההתחברות
   - הוספת הקריאות לאתחול

3. בדיקות:
   - וידוא טעינת הרשימה
   - בדיקת מעבר בין שתי השיטות
   - בדיקת התחברות עם שתי השיטות
   - בדיקת שמירה וטעינה מ-localStorage

## הערות טכניות

- נתיב הקובץ: הנתיב לקובץ `tv-list.json` הוא יחסי מיקום הקובץ `index.html`
- שמירה ב-localStorage: כל הבחירות נשמרות כדי לשמור על חוויית משתמש רציפה
- תאימות לאחור: השדות הידניים ממשיכים לעבוד כרגיל
- טיפול בשגיאות: במקרה שהקובץ לא נטען, המערכת תשתמש בגרסה מ-cache או תציע הזנה ידנית בלבד