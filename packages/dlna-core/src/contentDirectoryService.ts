import { createModuleLogger } from './logger'; // הוספת ייבוא הלוגר
import { sendUpnpCommand } from './upnpSoapClient';
import {
    ServiceDescription,
    Action,
    ActionArgument,
    BrowseFlag,
    Resource,
    DidlLiteItemBase,
    DidlLiteContainer,
    DidlLiteObject,
    BrowseResult,
    SoapResponse
} from './types';
import * as xml2js from 'xml2js';
 
// הערות: קובץ זה נוצר בהתאם לתכנון המפורט ב-documentation/content_directory_design.md

// הגדרות הטיפוסים BrowseFlag, Resource, DidlLiteItemBase, DidlLiteContainer, DidlLiteObject, BrowseResult
// הועברו לקובץ src/types.ts



/**
 * @class ContentDirectoryService
 * @description מספק ממשק לאינטראקציה עם שירות ContentDirectory של UPnP.
 * משתמש במידע מנותח מ-SCPD וב-UpnpSoapClient.
 */
export class ContentDirectoryService {
    private controlURL: string;
    private serviceType: string;
    // private soapClient: UpnpSoapClient; // הוסר מכיוון שנשתמש ישירות ב-sendUpnpCommand
    private serviceDescription: ServiceDescription; // מכיל actionList ו-stateVariables
    private xmlParser: xml2js.Parser;
    private logger: ReturnType<typeof createModuleLogger>; // שימוש ב-ReturnType
 
    /**
     * @constructor
     * @param {ServiceDescription} serviceInfo - אובייקט ServiceDescription המכיל את פרטי השירות,
     *                                         כולל `controlURL`, `serviceType`, `actionList` ורצוי גם `stateVariables`.
     * @throws {Error} אם `actionList` חסר ב-`serviceInfo`.
     */
    constructor(serviceInfo: ServiceDescription) {
        // נבדוק אם actionList קיים, הוא חיוני לדעת אילו פעולות קיימות
        if (!serviceInfo.actionList) {
            throw new Error("ContentDirectoryService requires ServiceDescription to have an actionList (from parsed SCPD data).");
        }
        if (!serviceInfo.controlURL) {
            throw new Error("ContentDirectoryService requires ServiceDescription to have a controlURL.");
        }
        if (!serviceInfo.serviceType) {
            throw new Error("ContentDirectoryService requires ServiceDescription to have a serviceType.");
        }

        this.serviceDescription = serviceInfo;
        this.controlURL = serviceInfo.controlURL;
        this.serviceType = serviceInfo.serviceType;
        // this.soapClient = soapClient; // הוסר
        this.logger = createModuleLogger('contentDirectoryService'); // אתחול הלוגר
 
        // אופציות לפרסר של DIDL-Lite, כפי שהומלץ בתכנון
        this.xmlParser = new xml2js.Parser({
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
    }

    /**
     * @method getAction
     * @private
     * @description מאחזר פעולה ספציפית מרשימת הפעולות ב-SCPD.
     * @param {string} actionName - שם הפעולה.
     * @returns {Action | undefined} אובייקט הפעולה אם נמצא, אחרת undefined.
     */
    private getAction(actionName: string): Action | undefined {
        // actionList מובטח להיות קיים מהקונסטרקטור
        // חיפוש case-insensitive לשם הפעולה
        const lowerCaseActionName = actionName.toLowerCase();
        // המרה של ערכי המפה למערך כדי להשתמש ב-find
        const actionsArray = Array.from(this.serviceDescription.actionList!.values());
        return actionsArray.find((a: Action) => a.name.toLowerCase() === lowerCaseActionName);
    }

    /**
     * @method parseDidlLite
     * @private
     * @async
     * @description מנתח מחרוזת XML של DIDL-Lite וממפה אותה למבני נתונים.
     * @param {string} didlLiteXmlString - מחרוזת ה-XML של DIDL-Lite.
     * @returns {Promise<Omit<BrowseResult, 'numberReturned' | 'totalMatches' | 'updateID'>>}
     *          אובייקט המכיל את הפריטים המנותחים.
     * @throws {Error} אם ניתוח ה-XML נכשל.
     */
    private async parseDidlLite(didlLiteXmlString: string): Promise<Pick<BrowseResult, 'items'>> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsedJs: any = await this.xmlParser.parseStringPromise(didlLiteXmlString);
            const didlNode = parsedJs['DIDL-Lite'];
            const items: (DidlLiteContainer | DidlLiteObject)[] = [];

            if (!didlNode) {
                this.logger.warn("DIDL-Lite node not found in XML string", { xmlStart: didlLiteXmlString.substring(0, 200) });
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
            this.logger.error('Error parsing DIDL-Lite XML', { errorMessage: err.message, xmlStart: didlLiteXmlString.substring(0, 500) });
            throw new Error(`Failed to parse DIDL-Lite XML: ${err.message}`);
        }
    }

    /**
     * @method _invokeSoapAction
     * @private
     * @async
     * @description עוטפת את הקריאה ל-sendUpnpCommand וממירה את התוצאה או השגיאה לפורמט SoapResponse.
     * @param {string} actionName - שם הפעולה לביצוע.
     * @param {Record<string, any>} params - פרמטרים לפעולה.
     * @returns {Promise<SoapResponse>}
     */
    private async _invokeSoapAction(actionName: string, params: Record<string, any>): Promise<SoapResponse> {
        this.logger.debug(`Invoking ${actionName} via _invokeSoapAction with params`, { params: JSON.stringify(params) });
        try {
            const actionResult = await sendUpnpCommand(
                this.controlURL,
                this.serviceType,
                actionName,
                params
            );
            // הנחה: התוצאה הגולמית היא התוצאה עצמה, כפי ש-sendUpnpCommand מחזיר את actionResponse ישירות.
            // אם sendUpnpCommand היה מחזיר את כל ה-parsedXml, היינו צריכים לחלץ את actionResponse ואת raw.
            return { success: true, data: { actionResponse: actionResult, raw: actionResult } };
        } catch (error: any) {
            if (error.soapFault) {
                this.logger.warn(`SOAP fault received for action ${actionName}`, { fault: error.soapFault });
                return { success: false, fault: error.soapFault };
            } else {
                this.logger.error(`Client-side error during SOAP action ${actionName}`, { message: error.message, stack: error.stack });
                return {
                    success: false,
                    fault: {
                        faultCode: 'ClientError',
                        faultString: error.message || `Unknown client error during ${actionName}`,
                        detail: error.stack
                    }
                };
            }
        }
    }

    /**
     * @method browse
     * @public
     * @async
     * @description מבצע פעולת Browse על שירות ContentDirectory.
     * @param {string} objectId - מזהה האובייקט לעיון.
     * @param {BrowseFlag} browseFlag - דגל הקובע את אופן העיון.
     * @param {string} [filter="*"] - רשימת תכונות מבוקשות.
     * @param {number} [startingIndex=0] - אינדקס הפריט הראשון.
     * @param {number} [requestedCount=0] - מספר הפריטים המבוקש (0 עבור הכל).
     * @param {string} [sortCriteria=""] - קריטריונים למיון.
     * @returns {Promise<BrowseResult>} תוצאת פעולת ה-Browse.
     * @throws {Error} אם הפעולה "Browse" אינה קיימת ב-SCPD, או אם התקשורת נכשלת.
     */
    public async browse(
        objectId: string,
        browseFlag: BrowseFlag,
        filter: string = "*",
        startingIndex: number = 0,
        requestedCount: number = 0,
        sortCriteria: string = ""
    ): Promise<BrowseResult> {
        const actionName = "Browse";
        const browseAction = this.getAction(actionName);
        if (!browseAction) {
            throw new Error(`Action "${actionName}" not found in service SCPD for ${this.serviceType}`);
        }

        // בניית פרמטרים בהתאם לשמות המוגדרים ב-SCPD (אם קיימים) או בשמות סטנדרטיים
        const params: { [key: string]: any } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        const argMap = { // מיפוי משמות קריאים לשמות אפשריים ב-SCPD
            ObjectID: objectId,
            BrowseFlag: browseFlag, // ישירות את ערך ה-enum
            Filter: filter,
            StartingIndex: startingIndex,
            RequestedCount: requestedCount,
            SortCriteria: sortCriteria,
        };

        // browseAction.arguments יכול להיות undefined לפי הגדרת Action ב-types.ts
        const actionArguments = browseAction.arguments || [];
        for (const [stdName, value] of Object.entries(argMap)) {
            const scpdArg = actionArguments.find((arg: ActionArgument) => arg.name === stdName && arg.direction === 'in');
            params[scpdArg ? scpdArg.name : stdName] = value; // השתמש בשם מה-SCPD אם קיים, אחרת בשם הסטנדרטי
        }
        
        const soapResponse: SoapResponse = await this._invokeSoapAction(actionName, params);

        if (soapResponse.success && soapResponse.data && soapResponse.data.actionResponse) {
            const responseData = soapResponse.data.actionResponse;
            let didlLiteXmlString = responseData.Result || responseData.result; // שרתים מסוימים עשויים להשתמש ב-result קטן
            
            // בדוק אם התוצאה היא אובייקט עם מאפיין '_' (כתוצאה מ-xml2js עם charkey)
            if (didlLiteXmlString && typeof didlLiteXmlString === 'object' && didlLiteXmlString._ && typeof didlLiteXmlString._ === 'string') {
                didlLiteXmlString = didlLiteXmlString._;
            }
 
            if (typeof didlLiteXmlString !== 'string') {
                this.logger.error("Browse response 'Result' is not a string or in expected object format", { result: didlLiteXmlString, fullResponse: responseData });
                throw new Error("Browse response 'Result' from SOAP action was not a string, not in expected object format, or was missing.");
            }
 
            const parsedDidl = await this.parseDidlLite(didlLiteXmlString);

            return {
                items: parsedDidl.items,
                numberReturned: parseInt(responseData.NumberReturned || responseData.numberReturned || '0', 10),
                totalMatches: parseInt(responseData.TotalMatches || responseData.totalMatches || '0', 10),
                updateID: responseData.UpdateID || responseData.updateID,
                rawResponse: soapResponse.data.raw,
            };
        } else {
            const fault = soapResponse.fault || { faultCode: 'UnknownError', faultString: 'Unknown error during Browse operation' };
            this.logger.error(`SOAP Fault during ${actionName}`, { fault });
            throw new Error(`SOAP Fault on ${actionName}: ${fault.faultString} (Code: ${fault.faultCode}, UPnP: ${fault.upnpErrorCode})`);
        }
    }

    /**
     * @method search
     * @public
     * @async
     * @description מבצע פעולת Search על שירות ContentDirectory.
     * @param {string} containerId - מזהה הקונטיינר לחיפוש (0 עבור כל ההתקן).
     * @param {string} searchCriteria - קריטריון החיפוש.
     * @param {string} [filter="*"] - רשימת תכונות מבוקשות.
     * @param {number} [startingIndex=0] - אינדקס הפריט הראשון.
     * @param {number} [requestedCount=0] - מספר הפריטים המבוקש (0 עבור הכל).
     * @param {string} [sortCriteria=""] - קריטריונים למיון.
     * @returns {Promise<BrowseResult>} תוצאת פעולת ה-Search (זהה ל-BrowseResult).
     * @throws {Error} אם הפעולה "Search" אינה קיימת ב-SCPD, או אם התקשורת נכשלת.
     */
    public async search(
        containerId: string,
        searchCriteria: string,
        filter: string = "*",
        startingIndex: number = 0,
        requestedCount: number = 0,
        sortCriteria: string = ""
    ): Promise<BrowseResult> {
        const actionName = "Search";
        const searchAction = this.getAction(actionName);
        if (!searchAction) {
            throw new Error(`Action "${actionName}" not found in service SCPD for ${this.serviceType}`);
        }

        const params: { [key: string]: any } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        const argMap = {
            ContainerID: containerId,
            SearchCriteria: searchCriteria,
            Filter: filter,
            StartingIndex: startingIndex,
            RequestedCount: requestedCount,
            SortCriteria: sortCriteria,
        };
        
        // searchAction.arguments יכול להיות undefined
        const actionArguments = searchAction.arguments || [];
        for (const [stdName, value] of Object.entries(argMap)) {
            const scpdArg = actionArguments.find((arg: ActionArgument) => arg.name === stdName && arg.direction === 'in');
            params[scpdArg ? scpdArg.name : stdName] = value;
        }
  
        const soapResponse: SoapResponse = await this._invokeSoapAction(actionName, params);

        if (soapResponse.success && soapResponse.data && soapResponse.data.actionResponse) {
            const responseData = soapResponse.data.actionResponse;
            let didlLiteXmlString = responseData.Result || responseData.result;

            // בדוק אם התוצאה היא אובייקט עם מאפיין '_' (כתוצאה מ-xml2js עם charkey)
            if (didlLiteXmlString && typeof didlLiteXmlString === 'object' && didlLiteXmlString._ && typeof didlLiteXmlString._ === 'string') {
                didlLiteXmlString = didlLiteXmlString._;
            }
 
            if (typeof didlLiteXmlString !== 'string') {
                 this.logger.error("Search response 'Result' is not a string or in expected object format", { result: didlLiteXmlString, fullResponse: responseData });
                throw new Error("Search response 'Result' from SOAP action was not a string, not in expected object format, or was missing.");
            }
 
            const parsedDidl = await this.parseDidlLite(didlLiteXmlString);

            return {
                items: parsedDidl.items,
                numberReturned: parseInt(responseData.NumberReturned || responseData.numberReturned || '0', 10),
                totalMatches: parseInt(responseData.TotalMatches || responseData.totalMatches || '0', 10),
                updateID: responseData.UpdateID || responseData.updateID,
                rawResponse: soapResponse.data.raw,
            };
        } else {
            const fault = soapResponse.fault || { faultCode: 'UnknownError', faultString: 'Unknown error during Search operation' };
            this.logger.error(`SOAP Fault during ${actionName}`, { fault });
            throw new Error(`SOAP Fault on ${actionName}: ${fault.faultString} (Code: ${fault.faultCode}, UPnP: ${fault.upnpErrorCode})`);
        }
    }
}