import { create } from 'xmlbuilder2';
import * as xml2js from 'xml2js';

import { createModuleLogger } from './logger';
import type {
    DidlLiteObject,
    DidlLiteContainer,
    DidlLiteItemBase,
    Resource,
    BrowseResult,
    ParsedProtocolInfo,
    DlnaParameters
} from './types';

const xmlParser = new xml2js.Parser({
    explicitArray: false, // חשוב למערכים של container, item, res
    charkey: '_', // תוכן טקסטואלי יהיה תחת מפתח זה
    explicitCharkey: true, // יש להגדיר ל-true אם משתמשים ב-charkey
    mergeAttrs: true, // מיזוג תכונות לאובייקט (עם @ כקידומת)
    attrNameProcessors: [key => `@${key}`], // כל התכונות יתחילו ב-@
    tagNameProcessors: [], // לא להסיר קידומות namespace, נטפל במיפוי
    valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
    // attrValueProcessors נכלל ב-valueProcessors אם הוא לא מוגדר בנפרד,
    // אך ניתן להגדיר גם אותו במפורש אם יש צורך בעיבוד שונה לתכונות.
});

const parseProtocolInfo = (protocolInfoString: string): ParsedProtocolInfo | undefined => {
    if (!protocolInfoString) return undefined;

    const parseDlnaOrgFlags = (flagsStr: string): DlnaParameters['flags'] | undefined => {
        if (!flagsStr || flagsStr.length !== 32) return undefined;
        const flagsInt = parseInt(flagsStr.substring(0, 8), 16);
        return {
            raw: flagsStr,
            senderPaced: (flagsInt & (1 << 31)) !== 0,
            dlnaV1_5: (flagsInt & (1 << 24)) !== 0,
            interactive: (flagsInt & (1 << 21)) !== 0,
            playContainer: (flagsInt & (1 << 22)) !== 0,
            timeBasedSeek: (flagsInt & (1 << 18)) !== 0,
            byteBasedSeek: (flagsInt & (1 << 17)) !== 0,
            s0Increasing: (flagsInt & (1 << 7)) !== 0,
        };
    };

    const parseDlnaOrgOp = (opStr: string): DlnaParameters['operation'] => {
        const opInt = parseInt(opStr, 16);
        return {
            timeSeekSupported: (opInt & 0x01) !== 0,
            rangeSeekSupported: (opInt & 0x10) !== 0,
        };
    };

    const parts = protocolInfoString.split(':');
    const protocol = parts[0] || '';
    const network = parts[1] || '';
    const contentFormat = parts[2] || '';

    const dlnaParameters: DlnaParameters = {
        rawDlnaParams: {},
    };

    if (parts.length > 3 && parts[3]) {
        const params = parts[3].split(';');
        for (const param of params) {
            const [key, value] = param.split('=');
            if (key && value) {
                dlnaParameters.rawDlnaParams[key] = value;

                if (key === 'DLNA.ORG_OP') {
                    dlnaParameters.operation = parseDlnaOrgOp(value);
                }

                if (key === 'DLNA.ORG_CI') {
                    dlnaParameters.conversionIndication = (value === '1') ? 'transcoded' : 'original';
                }

                if (key === 'DLNA.ORG_FLAGS') {
                    dlnaParameters.flags = parseDlnaOrgFlags(value);
                }
            }
        }
    }

    return {
        protocol,
        network,
        contentFormat,
        dlnaParameters,
    };
};


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

const ignoreKeys = [
    'dc:date',
    'upnp:genre',
    'dc:title',
    'dc:creator',
    'upnp:class',
    'upnp:writeStatus',
    'upnp:createClass',
    'upnp:searchClass',
    'upnp:albumArtURI',
    'upnp:artist',
    'upnp:album',
    'upnp:originalTrackNumber',
    'res',
    'searchable',
    'childCount',
];

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
                title: node['dc:title']?._ || node['dc:title'] || '',
                class: node['upnp:class']?._ || node['upnp:class'] || '',
                restricted: node['@restricted'] === '1' || node['@restricted'] === true || node['@restricted'] === 'true',
                writeStatus: node['upnp:writeStatus']?._ || node['upnp:writeStatus'],
            };

            if (isContainer) {
                const containerItem: DidlLiteContainer = {
                    ...baseItem,
                    childCount: node['@childCount'] !== undefined ? parseInt(node['@childCount'], 10) : undefined,
                    searchable: node['@searchable'] === '1' || node['@searchable'] === true || node['@searchable'] === 'true',
                    createClass: node['upnp:createClass']?._ || node['upnp:createClass'],
                    searchClass: node['upnp:searchClass']?._ || node['upnp:searchClass'],
                };
                return containerItem;
            } else {
                const objectItem: DidlLiteObject = {
                    ...baseItem,
                    albumArtURI: node['upnp:albumArtURI']?._ || node['upnp:albumArtURI'],
                    artist: node['dc:creator']?._ || node['dc:creator'] || node['upnp:artist']?._ || node['upnp:artist'],
                    album: node['upnp:album']?._ || node['upnp:album'],
                    genre: node['upnp:genre']?._ || node['upnp:genre'],
                    date: node['dc:date']?._ || node['dc:date'],
                    originalTrackNumber: node['upnp:originalTrackNumber']?._ !== undefined ? parseInt(node['upnp:originalTrackNumber']._, 10) : undefined,
                    resources: [],
                };


                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (node.res) {

                    const resNodeToResource = (resNode: any) => {
                        const protocolInfoString = resNode['@protocolInfo'];
                        const resource: Resource = {
                            uri: resNode._ || '', // תוכן טקסטואלי של res הוא ה-URI
                            protocolInfo: protocolInfoString,
                            parsedProtocolInfo: parseProtocolInfo(protocolInfoString),
                            size: resNode['@size'] !== undefined ? parseInt(resNode['@size'], 10) : undefined,
                            duration: resNode['@duration'],
                            bitrate: resNode['@bitrate'] !== undefined ? parseInt(resNode['@bitrate'], 10) : undefined,
                            sampleFrequency: resNode['@sampleFrequency'] !== undefined ? parseInt(resNode['@sampleFrequency'], 10) : undefined,
                            bitsPerSample: resNode['@bitsPerSample'] !== undefined ? parseInt(resNode['@bitsPerSample'], 10) : undefined,
                            nrAudioChannels: resNode['@nrAudioChannels'] !== undefined ? parseInt(resNode['@nrAudioChannels'], 10) : undefined,
                            resolution: resNode['@resolution'],
                            colorDepth: resNode['@colorDepth'] !== undefined ? parseInt(resNode['@colorDepth'], 10) : undefined,
                            protection: resNode['@protection'],
                            importUri: resNode['@importUri'],
                            dlnaManaged: resNode['@dlnaManaged'],
                        };
                        // הוספת תכונות נוספות שלא מופו במפורש ל-Resource
                        for (const attrKey in resNode) {
                            if (
                                attrKey.startsWith('@')
                                && !(attrKey.substring(1) in resource)
                                && resource[attrKey.substring(1) as keyof Resource] === undefined
                            ) {
                                resource[attrKey.substring(1)] = resNode[attrKey];
                            }
                        }
                        return resource;
                    };

                    if (Array.isArray(node.res)) {
                        objectItem.resources = node.res.map(resNodeToResource);
                    } else {
                        objectItem.resources = [
                            resNodeToResource(node.res)
                        ];
                    }

                }

                // הוספת כל שאר התכונות והאלמנטים שלא מופו במפורש
                for (const key in node) {
                    let attrName = key;

                    if (key.startsWith('@')) { // תכונות
                        attrName = key.substring(1);
                    }

                    if (!(attrName in objectItem) && !(ignoreKeys.includes(attrName))) {

                        if (
                            (objectItem[attrName as keyof DidlLiteItemBase] === undefined) &&
                            (typeof node[key] === 'string')
                        ) {
                            objectItem[attrName as keyof DidlLiteItemBase] = node[key];

                        } else if (node[key] && node[key]._) { // אלמנטים עם תוכן טקסטואלי
                            if (!(key in objectItem) && objectItem[key as keyof DidlLiteItemBase] === undefined) {
                                objectItem[key] = node[key]._;
                            }
                        } else if (Array.isArray(node[key]) && node[key].length === 1 && typeof node[key][0] === 'string') { // אלמנטים שהם מחרוזת פשוטה
                            if (!(key in objectItem) && objectItem[key as keyof DidlLiteItemBase] === undefined) {
                                objectItem[key] = node[key][0];
                            }
                        }
                    }


                }
                return objectItem;
            }
        };

        if (didlNode.container) {
            const containers = Array.isArray(didlNode.container) ? didlNode.container : [didlNode.container];
            containers.forEach((cNode: any) => items.push(mapNodeToItem(cNode, true) as DidlLiteContainer));
        }
        if (didlNode.item) {
            const itemNodes = Array.isArray(didlNode.item) ? didlNode.item : [didlNode.item];
            itemNodes.forEach((iNode: any) => items.push(mapNodeToItem(iNode, false) as DidlLiteObject));
        }

        return { items };

    } catch (error) {
        const err = error as Error;
        logger.error('Error parsing DIDL-Lite XML', { errorMessage: err.message, xmlStart: didlLiteXmlString.substring(0, 500) });
        throw new Error(`Failed to parse DIDL-Lite XML: ${err.message}`);
    }
}
