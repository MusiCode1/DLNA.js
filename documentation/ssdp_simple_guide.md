
# NOTIFY
```http
NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
NT: urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
NTS: ssdp:alive
SERVER: Linux/3.4 DLNADOC/1.50 UPnP/1.0 DMS/1.0
USN: uuid:9c219fd1-b9e5-637b-480c-88bf4eb39ed4::urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
CACHE-CONTROL: max-age=25
LOCATION: http://10.100.102.106:7879/rootDesc.xml


```

# M-SEARCH
```http
M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: "ssdp:discover"
MX: 5
ST: upnp:rootdevice
USER-AGENT: Android/34 UPnP/2.0 upnped/1.1.2 


```

# HTTP RESPONSE
```http
HTTP/1.1 200 OK
ST: urn:schemas-upnp-org:service:ConnectionManager:1
USN: uuid:e2dde756-23aa-4d07-9804-42e5bc91e58c::urn:schemas-upnp-org:service:ConnectionManager:1
Location: http://192.168.1.108:2869/upnphost/udhisapi.dll?content=uuid:e2dde756-23aa-4d07-9804-42e5bc91e58c
OPT:"http://schemas.upnp.org/upnp/1/0/"; ns=01
01-NLS: 6b166944468fd3aacf466f04ae3e170d
Cache-Control: max-age=900
Server: Microsoft-Windows/10.0 UPnP/1.0 UPnP-Device-Host/1.0
Ext: 
Date: Wed, 21 May 2025 02:16:34 GMT


```

---
# מילון מונחים
## **ST:** Search Target
## **USN:** Unique Service Name.
זהו מזהה ייחודי עבור שירות או התקן ברשת.
  *  **עבור התקן שורש (root device):** `uuid:device-uuid::upnp:rootdevice`
  *  **עבור התקן משובץ (embedded device):** `uuid:device-uuid::urn:schemas-upnp-org:device:deviceType:v`
  *  **עבור שירות (service):** `uuid:device-uuid::urn:schemas-upnp-org:service:serviceType:v`

## **UDN:** ??

## **NT:** Notification Type
סוג ההודעה. מציין את סוג ההתקן או השירות שההודעה מתייחסת אליו (למשל, `urn:schemas-upnp-org:device:MediaRenderer:1`).

## **NTS:** Notification Sub Type
תת-סוג ההודעה. מציין את האירוע שגרם להודעה, כגון:
  *  `ssdp:alive`: התקן או שירות חדש שהצטרף לרשת או חידוש הכרזה.
  *  `ssdp:byebye`: התקן או שירות שעוזב את הרשת.
  *  `ssdp:update`: עדכון בפרטי ההתקן או השירות.


## **MAN:** Mandatory
בהודעת `M-SEARCH`, הערך `"ssdp:discover"` מציין שזוהי בקשת גילוי התקנים.

## **MX:** Maximum eXtent
בהודעת `M-SEARCH`, זהו הזמן המקסימלי (בשניות) שהתקנים צריכים להמתין באופן אקראי לפני שליחת תגובה. זה נועד למנוע עומס ברשת על ידי פיזור התגובות בזמן.


**HOST:** כתובת ה-IP והפורט שאליהם ההודעה מיועדת. בהודעות SSDP, זו בדרך כלל כתובת ה-multicast `239.255.255.250` והפורט `1900`.


**SERVER:** מחרוזת המזהה את התוכנה (לרוב מערכת הפעלה וגרסת שרת UPnP/DLNA) של ההתקן השולח את ההודעה.
**CACHE-CONTROL:** הוראות לשמירת ההודעה במטמון. הערך `max-age=X` מציין את משך הזמן המקסימלי (בשניות) שההודעה תקפה ויש לשמור אותה.
**LOCATION:** כתובת URL מלאה (absolute URL) לקובץ תיאור ה-XML של ההתקן (Device Description Document). קובץ זה מכיל מידע מפורט על ההתקן והשירותים שהוא מציע.

**USER-AGENT:** מחרוזת המזהה את תוכנת הלקוח (control point) השולחת את בקשת ה-`M-SEARCH`.
**OPT:** Optional. משמש להעברת מידע נוסף על יכולות UPnP, בדרך כלל בשילוב עם כותרת `NS` (Namespace).
**01-NLS:** UPnP Namespace Language Support. מספר סידורי המשמש למעקב אחר עדכונים בתיאור ההתקן. ה-`01` מתייחס למזהה ה-namespace שהוגדר בכותרת `OPT` או `NS`.
**Ext:** Extension. כותרת ריקה זו מציינת שהשרת תומך בהרחבות לפרוטוקול HTTP הבסיסי, כפי שנדרש על ידי UPnP.
**Date:** תאריך ושעת שליחת התגובה בפורמט HTTP סטנדרטי.
     *  `uuid:device-uuid`: המזהה הייחודי של ההתקן.
     *  החלק שאחרי `::` מציין את סוג ההודעה או השירות.
