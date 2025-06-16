import { create } from 'xmlbuilder2';
import * as xml2js from 'xml2js';

import { createModuleLogger } from './logger';
import type {
    DidlLiteObject,
    DidlLiteContainer,
    DidlLiteItemBase,
    Resource,
    BrowseResult
} from './types';

const xmlParser = new xml2js.Parser({
    explicitArray: true, // חשוב למערכים של container, item, res
    charkey: '_', // תוכן טקסטואלי יהיה תחת מפתח זה
    explicitCharkey: true, // יש להגדיר ל-true אם משתמשים ב-charkey
    mergeAttrs: true, // מיזוג תכונות לאובייקט (עם @ כקידומת)
    attrNameProcessors: [key => `@${key}`], // כל התכונות יתחילו ב-@
    tagNameProcessors: [], // לא להסיר קידומות namespace, נטפל במיפוי
    valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
    // attrValueProcessors נכלל ב-valueProcessors אם הוא לא מוגדר בנפרד,
    // אך ניתן להגדיר גם אותו במפורש אם יש צורך בעיבוד שונה לתכונות.
});

const logger = createModuleLogger('didlLiteUtils');

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

/**
 * @async
 * @description מנתח מחרוזת XML של DIDL-Lite וממפה אותה למבני נתונים.
 * @param {string} didlLiteXmlString - מחרוזת ה-XML של DIDL-Lite.
 * @returns {Promise<Omit<BrowseResult, 'numberReturned' | 'totalMatches' | 'updateID'>>}
 *          אובייקט המכיל את הפריטים המנותחים.
 * @throws {Error} אם ניתוח ה-XML נכשל.
 */
export async function parseDidlLite(didlLiteXmlString: string): Promise<Pick<BrowseResult, 'items'>> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsedJs: any = await xmlParser.parseStringPromise(didlLiteXmlString);
        const didlNode = parsedJs['DIDL-Lite'];
        const items: (DidlLiteContainer | DidlLiteObject)[] = [];

        if (!didlNode) {
            logger.warn("DIDL-Lite node not found in XML string", { xmlStart: didlLiteXmlString.substring(0, 200) });
            return { items: [] };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapNodeToItem = (node: any, isContainer: boolean): DidlLiteItemBase => {
            const baseItem: DidlLiteItemBase = {
                id: node['@id'] || '',
                parentId: node['@parentID'] || '',
                title: node['dc:title']?.[0]?._ || node['dc:title']?.[0] || '',
                class: node['upnp:class']?.[0]?._ || node['upnp:class']?.[0] || '',
                restricted: node['@restricted'] === '1' || node['@restricted'] === true || node['@restricted'] === 'true',
                writeStatus: node['upnp:writeStatus']?.[0]?._ || node['upnp:writeStatus']?.[0],
            };

            // הוספת כל שאר התכונות והאלמנטים שלא מופו במפורש
            for (const key in node) {
                if (key.startsWith('@')) { // תכונות
                    if (!(key.substring(1) in baseItem) && baseItem[key.substring(1) as keyof DidlLiteItemBase] === undefined) {
                        baseItem[key.substring(1)] = node[key];
                    }
                } else if (node[key] && node[key][0] && node[key][0]._) { // אלמנטים עם תוכן טקסטואלי
                    if (!(key in baseItem) && baseItem[key as keyof DidlLiteItemBase] === undefined) {
                        baseItem[key] = node[key][0]._;
                    }
                } else if (Array.isArray(node[key]) && node[key].length === 1 && typeof node[key][0] === 'string') { // אלמנטים שהם מחרוזת פשוטה
                    if (!(key in baseItem) && baseItem[key as keyof DidlLiteItemBase] === undefined) {
                        baseItem[key] = node[key][0];
                    }
                }
                // לא מטפלים כאן באלמנטים מורכבים יותר כמו <res> שדורשים מיפוי משלהם
            }


            if (isContainer) {
                const containerItem: DidlLiteContainer = {
                    ...baseItem,
                    childCount: node['@childCount'] !== undefined ? parseInt(node['@childCount'], 10) : undefined,
                    searchable: node['@searchable'] === '1' || node['@searchable'] === true || node['@searchable'] === 'true',
                    createClass: node['upnp:createClass']?.[0]?._ || node['upnp:createClass']?.[0],
                    searchClass: node['upnp:searchClass']?.[0]?._ || node['upnp:searchClass']?.[0],
                };
                return containerItem;
            } else {
                const objectItem: DidlLiteObject = {
                    ...baseItem,
                    albumArtURI: node['upnp:albumArtURI']?.[0]?._ || node['upnp:albumArtURI']?.[0],
                    artist: node['dc:creator']?.[0]?._ || node['dc:creator']?.[0] || node['upnp:artist']?.[0]?._ || node['upnp:artist']?.[0],
                    album: node['upnp:album']?.[0]?._ || node['upnp:album']?.[0],
                    genre: node['upnp:genre']?.[0]?._ || node['upnp:genre']?.[0],
                    date: node['dc:date']?.[0]?._ || node['dc:date']?.[0],
                    originalTrackNumber: node['upnp:originalTrackNumber']?.[0]?._ !== undefined ? parseInt(node['upnp:originalTrackNumber'][0]._, 10) : undefined,
                    resources: [],
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (node['res'] && Array.isArray(node['res'])) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    objectItem.resources = node['res'].map((rNode: any) => {
                        const resource: Resource = {
                            uri: rNode._ || '', // תוכן טקסטואלי של res הוא ה-URI
                            protocolInfo: rNode['@protocolInfo'],
                            size: rNode['@size'] !== undefined ? parseInt(rNode['@size'], 10) : undefined,
                            duration: rNode['@duration'],
                            bitrate: rNode['@bitrate'] !== undefined ? parseInt(rNode['@bitrate'], 10) : undefined,
                            sampleFrequency: rNode['@sampleFrequency'] !== undefined ? parseInt(rNode['@sampleFrequency'], 10) : undefined,
                            bitsPerSample: rNode['@bitsPerSample'] !== undefined ? parseInt(rNode['@bitsPerSample'], 10) : undefined,
                            nrAudioChannels: rNode['@nrAudioChannels'] !== undefined ? parseInt(rNode['@nrAudioChannels'], 10) : undefined,
                            resolution: rNode['@resolution'],
                            colorDepth: rNode['@colorDepth'] !== undefined ? parseInt(rNode['@colorDepth'], 10) : undefined,
                            protection: rNode['@protection'],
                            importUri: rNode['@importUri'],
                            dlnaManaged: rNode['@dlnaManaged'],
                        };
                        // הוספת תכונות נוספות שלא מופו במפורש ל-Resource
                        for (const attrKey in rNode) {
                            if (attrKey.startsWith('@') && !(attrKey.substring(1) in resource) && resource[attrKey.substring(1) as keyof Resource] === undefined) {
                                resource[attrKey.substring(1)] = rNode[attrKey];
                            }
                        }
                        return resource;
                    });
                }
                return objectItem;
            }
        };

        if (didlNode.container && Array.isArray(didlNode.container)) {
            didlNode.container.forEach((cNode: any) => items.push(mapNodeToItem(cNode, true) as DidlLiteContainer)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        if (didlNode.item && Array.isArray(didlNode.item)) {
            didlNode.item.forEach((iNode: any) => items.push(mapNodeToItem(iNode, false) as DidlLiteObject)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }

        return { items };

    } catch (error) {
        const err = error as Error;
        logger.error('Error parsing DIDL-Lite XML', { errorMessage: err.message, xmlStart: didlLiteXmlString.substring(0, 500) });
        throw new Error(`Failed to parse DIDL-Lite XML: ${err.message}`);
    }
}