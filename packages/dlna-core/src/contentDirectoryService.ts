import { createModuleLogger } from './logger'; // הוספת ייבוא הלוגר
import { sendUpnpCommand } from './upnpSoapClient';
import { parseDidlLite } from "./didlLiteUtils";
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
 
            const parsedDidl = await parseDidlLite(didlLiteXmlString);

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
 
            const parsedDidl = await parseDidlLite(didlLiteXmlString);

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