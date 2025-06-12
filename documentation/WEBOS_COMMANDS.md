# פקודות WebOS TV

רשימת כל הפקודות האפשריות לשליטה בטלוויזיית WebOS.

## שליטה במדיה (Media Control)

### פקודות נגינה
- `ssap://media.controls/play` - הפעל
- `ssap://media.controls/pause` - השהה
- `ssap://media.controls/stop` - עצור
- `ssap://media.controls/rewind` - הרצה אחורה
- `ssap://media.controls/fastForward` - הרצה קדימה

### שליטה בשמע
- `ssap://audio/volumeUp` - הגבר ווליום
- `ssap://audio/volumeDown` - הנמך ווליום
- `ssap://audio/getVolume` - קבל עוצמת שמע נוכחית
- `ssap://audio/setVolume` - הגדר עוצמת שמע (נדרש פרמטר `volume`)
- `ssap://audio/setMute` - השתק/בטל השתקה (נדרש פרמטר `mute`)
- `ssap://audio/getSoundOutput` - קבל מקור שמע נוכחי
- `ssap://audio/changeSoundOutput` - שנה מקור שמע

### מקורות שמע אפשריים
- `tv_speaker` - רמקול הטלוויזיה
- `external_speaker` - רמקול חיצוני
- `soundbar` - סאונדבר
- `bt_soundbar` - סאונדבר בלוטות'
- `tv_external_speaker` - רמקול חיצוני של הטלוויזיה

## שליטה בערוצים (TV Control)
- `ssap://tv/channelDown` - ערוץ למטה
- `ssap://tv/channelUp` - ערוץ למעלה
- `ssap://tv/openChannel` - פתח ערוץ ספציפי (נדרש פרמטר `channelId`)
- `ssap://tv/getCurrentChannel` - קבל ערוץ נוכחי
- `ssap://tv/getChannelList` - קבל רשימת ערוצים
- `ssap://tv/getChannelProgramInfo` - קבל מידע על תוכנית נוכחית

## שליטה במערכת (System Control)
- `ssap://system/turnOff` - כיבוי הטלוויזיה
- `ssap://com.webos.service.tvpower/power/turnOffScreen` - כיבוי מסך
- `ssap://com.webos.service.tvpower/power/turnOnScreen` - הדלקת מסך
- `ssap://system.notifications/createToast` - הצג הודעה על המסך
- `ssap://com.webos.service.update/getCurrentSWInformation` - קבל מידע על גרסת תוכנה

## שליטה באפליקציות (Application Control)
- `ssap://com.webos.applicationManager/listApps` - קבל רשימת אפליקציות
- `ssap://system.launcher/launch` - הפעל אפליקציה (נדרש פרמטר `id`)
- `ssap://com.webos.applicationManager/getForegroundAppInfo` - קבל מידע על אפליקציה פעילה
- `ssap://system.launcher/close` - סגור אפליקציה

## שליטה בקלט (Input Control)

### פקודות מקלדת
- `ssap://com.webos.service.ime/insertText` - הכנס טקסט
- `ssap://com.webos.service.ime/deleteCharacters` - מחק תווים
- `ssap://com.webos.service.ime/sendEnterKey` - שלח מקש Enter

### פקודות עכבר
- `type:move\ndx:{x}\ndy:{y}` - הזז עכבר
- `type:click` - לחיצת עכבר
- `type:scroll\ndx:{x}\ndy:{y}` - גלילה

### פקודות שליטה
- `type:button\nname:LEFT` - שמאלה
- `type:button\nname:RIGHT` - ימינה
- `type:button\nname:UP` - למעלה
- `type:button\nname:DOWN` - למטה
- `type:button\nname:ENTER` - אישור
- `type:button\nname:BACK` - חזור
- `type:button\nname:EXIT` - יציאה
- `type:button\nname:HOME` - בית
- `type:button\nname:MENU` - תפריט
- `type:button\nname:DASH` - מקף
- `type:button\nname:INFO` - מידע
- `type:button\nname:ASTERISK` - כוכבית
- `type:button\nname:CC` - כתוביות

### מספרים
- `type:button\nname:0` עד `type:button\nname:9` - מקשי מספרים

### צבעים
- `type:button\nname:RED` - אדום
- `type:button\nname:GREEN` - ירוק
- `type:button\nname:YELLOW` - צהוב
- `type:button\nname:BLUE` - כחול

### פקודות מדיה נוספות
- `type:button\nname:VOLUMEUP` - הגבר ווליום
- `type:button\nname:VOLUMEDOWN` - הנמך ווליום
- `type:button\nname:CHANNELUP` - ערוץ למעלה
- `type:button\nname:CHANNELDOWN` - ערוץ למטה
- `type:button\nname:PLAY` - נגן
- `type:button\nname:PAUSE` - השהה
- `type:button\nname:STOP` - עצור
- `type:button\nname:REWIND` - הרצה אחורה
- `type:button\nname:FASTFORWARD` - הרצה קדימה

## שליטה במקורות קלט (Source Control)
- `ssap://tv/getExternalInputList` - קבל רשימת מקורות קלט
- `ssap://tv/switchInput` - החלף מקור קלט (נדרש פרמטר `inputId`)

## הערות
1. חלק מהפקודות דורשות פרמטרים נוספים
2. חלק מהפקודות דורשות הרשאות מיוחדות
3. יש לוודא שהטלוויזיה והמחשב מחוברים לאותה רשת
4. חלק מהפקודות עשויות להשתנות בין גרסאות שונות של WebOS
5. לפני שימוש בפקודות עכבר, יש להתחבר לשקע העכבר באמצעות `ssap://com.webos.service.networkinput/getPointerInputSocket`


`ssap://com.webos.service.networkinput/getPointerInputSocket`
```json
{
    "type":"response",
    "id":"febdfbf0-34df-4cb4-9fcc-87d9e6d4ae16",
    "payload":{
        "returnValue":true,
        "socketPath":"wss://192.168.1.41:3001/resources/3cad29d9f95bf5ffe3f56ef744994298c7011b3c/netinput.pointer.sock"
    }
}
```


# 
- קבל צילום מסך - `ssap://tv/executeOneShot`
## דוגמאות לשימוש

### הפעלת נגן המדיה עם קובץ ספציפי
```javascript
// הפעלת נגן המדיה
tv.sendMessage('request', 'ssap://system.launcher/launch', {
    id: 'com.webos.app.mediadiscovery',
    params: {
        contentTarget: "http://example.com/video.mp4"
    }
});

// או בדרך אחרת
tv.sendMessage('request', 'ssap://media.controls/play', {
    mediaUrl: "http://example.com/video.mp4"
});
```

### הפעלת Netflix
```javascript
tv.sendMessage('request', 'ssap://system.launcher/launch', {
    id: 'netflix'
});

// אפשר גם להפעיל תוכן ספציפי
tv.sendMessage('request', 'ssap://system.launcher/launch', {
    id: 'netflix',
    contentId: 'NETFLIX_CONTENT_ID',
    params: {
        contentType: 'movie'
    }
});
```

### שינוי עוצמת שמע
```javascript
tv.sendMessage('request', 'ssap://audio/setVolume', {
    volume: 50
});
```

### הצגת הודעה על המסך
```javascript
tv.sendMessage('request', 'ssap://system.notifications/createToast', {
    message: "שלום!"
});
```

### שימוש בעכבר
```javascript
// התחברות לשקע העכבר
tv.sendMessage('request', 'ssap://com.webos.service.networkinput/getPointerInputSocket');

// לאחר קבלת socketPath, התחבר אליו ושלח פקודות:
mouseSocket.send('type:move\ndx:100\ndy:100\n\n');  // הזז עכבר
mouseSocket.send('type:click\n\n');                 // לחץ
```

### החלפת מקור קלט
```javascript
// קבלת רשימת מקורות
tv.sendMessage('request', 'ssap://tv/getExternalInputList');

// החלפה ל-HDMI1
tv.sendMessage('request', 'ssap://tv/switchInput', {
    inputId: "HDMI_1"
});
```

### שליטה בערוצים
```javascript
// מעבר לערוץ ספציפי
tv.sendMessage('request', 'ssap://tv/openChannel', {
    channelId: "CHANNEL_ID"
});

// קבלת מידע על הערוץ הנוכחי
tv.sendMessage('request', 'ssap://tv/getCurrentChannel');
```

### הרשמה לעדכונים
```javascript
// הרשמה לעדכוני עוצמת שמע
tv.sendMessage('subscribe', 'ssap://audio/getVolume');

// הרשמה לעדכוני ערוץ נוכחי
tv.sendMessage('subscribe', 'ssap://tv/getCurrentChannel');

// הרשמה לעדכוני אפליקציה פעילה
tv.sendMessage('subscribe', 'ssap://com.webos.applicationManager/getForegroundAppInfo');
```

### צילום מסך
`ssap://tv/executeOneShot`

```json
{
    "type":"response",
    "id":"9da62942-c41f-4554-b9dc-2305c079505b",
    "payload":{
        "returnValue":true,
        "imageUri":"https://192.168.1.41:3001/resources/9a2311fee1182fcea6e96cc563a92a0e04837093/capture.jpg"
    }
}
```

## תיעוד פקודות
[תיעוד פקודות](https://github.com/rhinoswirl/webostv-research/blob/cbbd676bb572be2b6eecd3bb5e0ee655da9ef120/apis/com.webos.service.tvpower.md?plain=1)

https://github.com/klattimer/LGWebOSRemote/blob/14186c3f27752d158c640ac3231947cb5a6447bb/LGTV/remote.py#L235

