import { create } from 'xmlbuilder2';
import type { DidlLiteObject, Resource } from './types'; // ודא שהנתיב לטיפוסים נכון

/**
 * יוצר מחרוזת XML של DIDL-Lite עבור פריט מדיה בודד באמצעות xmlbuilder2.
 * @param item - אובייקט הפריט (DidlLiteObject).
 * @param resource - אובייקט המשאב (Resource) של הפריט.
 * @returns מחרוזת XML של DIDL-Lite.
 */
export function createSingleItemDidlLiteXml(item: DidlLiteObject, resource: Resource): string {
    const { id, parentId, restricted, title, class: itemClass } = item;
    const { uri, protocolInfo, size, duration } = resource;

    // טיפול בערכים אופציונליים או כאלה שצריכים להיות מחרוזת
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemAttributes: any = {
        'id': id,
        'parentID': parentId,
        'restricted': restricted ? '1' : '0'
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resAttributes: any = {
        'protocolInfo': protocolInfo || '' // חייב להיות, גם אם ריק
    };
    if (size !== undefined && size !== null) {
        resAttributes['size'] = String(size);
    }
    if (duration !== undefined && duration !== null) {
        // ודא שהפורמט של משך הזמן תואם למה שהשרת מצפה לו (למשל, HH:MM:SS.mmm)
        // כאן נניח שהוא כבר בפורמט הנכון או שאין צורך בשינוי מיוחד
        resAttributes['duration'] = String(duration);
    }
    // ניתן להוסיף כאן עוד מאפיינים ל-res אם קיימים ב-resource ויש להם משמעות ב-DIDL-Lite

    const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('DIDL-Lite', {
            'xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
            'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
            'xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/'
        })
            .ele('item', itemAttributes)
                .ele('dc:title').txt(title || '').up() // ודא שיש ערך, גם אם ריק
                .ele('upnp:class').txt(itemClass || '').up() // ודא שיש ערך, גם אם ריק
                .ele('res', resAttributes).txt(uri || '').up() // ודא שיש ערך, גם אם ריק
            .up(); // סגירת item

    // headless: true מונע את הצהרת ה-XML <?xml version="1.0"?> אם השרת לא אוהב אותה.
    // רוב השרתים בסדר עם זה, אבל אם יש בעיות, אפשר להוסיף.
    // prettyPrint: false כדי לחסוך מקום.
    return root.end({ prettyPrint: false, headless: true });
}