// packages/dlna-core/src/upnpSpecificServiceFactory.ts
// קובץ זה מכיל פונקציות "יצרן/מאמת" עבור סוגי שירות ספציפיים נתמכים.

import type { ServiceDescription, Action, ActionArgument } from './types';
import { ContentDirectory, AVTransport, RenderingControl } from './specificTypes';
import { normalizeGenericKey } from './upnpDeviceProcessor'; // ייבוא הפונקציה


/**
 * @hebrew מנסה ליצור ולהחזיר שירות ContentDirectory ספציפי מתיאור שירות גנרי.
 * @param service - תיאור השירות הגנרי.
 * @returns אובייקט שירות ContentDirectory ספציפי אם ההמרה הצליחה, אחרת null.
 */
export function tryCreateContentDirectoryService(service: ServiceDescription): ContentDirectory.SpecificService | null {
    if (service.serviceType !== 'urn:schemas-upnp-org:service:ContentDirectory:1') {
        return null;
    }

    if (!service.actionList) {
        return null;
    }

    const requiredActions = ['Browse', 'GetSearchCapabilities', 'GetSortCapabilities', 'GetSystemUpdateID']; // ניתן להוסיף עוד פעולות חובה
    for (const actionName of requiredActions) {
        if (!service.actionList.has(normalizeGenericKey(actionName))) {
            // ניתן להוסיף לוג במקרה של פעולה חסרה
            // console.warn(`ContentDirectory: Missing required action: ${actionName}`);
            // return null; // לפי ההנחיות, אם פעולה חובה חסרה, נחזיר null. כרגע נמשיך כדי לאפשר גמישות מסוימת.
        }
    }

    const specificService = service as ContentDirectory.SpecificService;
    specificService.actions = {} as ContentDirectory.ContentDirectoryServiceActions;

    // מיפוי פעולות גנריות לפעולות ספציפיות
    const browseAction = service.actionList.get(normalizeGenericKey('Browse'));
    if (browseAction) {
        specificService.actions.Browse = browseAction as Action & { invoke: (args: ContentDirectory.CDSBrowseArgs) => Promise<ContentDirectory.CDSBrowseResult> };
    }

    const searchAction = service.actionList.get(normalizeGenericKey('Search'));
    if (searchAction) {
        specificService.actions.Search = searchAction as Action & { invoke: (args: ContentDirectory.CDSSearchArgs) => Promise<ContentDirectory.CDSSearchResult> };
    }

    const getSearchCapsAction = service.actionList.get(normalizeGenericKey('GetSearchCapabilities'));
    if (getSearchCapsAction) {
        specificService.actions.GetSearchCapabilities = getSearchCapsAction as Action & { invoke: () => Promise<ContentDirectory.CDSGetSearchCapabilitiesResult> };
    }

    const getSortCapsAction = service.actionList.get(normalizeGenericKey('GetSortCapabilities'));
    if (getSortCapsAction) {
        specificService.actions.GetSortCapabilities = getSortCapsAction as Action & { invoke: () => Promise<ContentDirectory.CDSGetSortCapabilitiesResult> };
    }

    const getSystemUpdateIDAction = service.actionList.get(normalizeGenericKey('GetSystemUpdateID'));
    if (getSystemUpdateIDAction) {
        specificService.actions.GetSystemUpdateID = getSystemUpdateIDAction as Action & { invoke: () => Promise<ContentDirectory.CDSGetSystemUpdateIDResult> };
    }
    
    // בדיקה סופית - אם אין אף פעולה ספציפית שמופתה, אולי עדיף להחזיר null
    // כרגע, נחזיר את השירות גם אם חלק מהפעולות לא קיימות, בהתאם לגמישות שהוחלטה קודם
    return specificService;
}

/**
 * @hebrew מנסה ליצור ולהחזיר שירות AVTransport ספציפי מתיאור שירות גנרי.
 * @param service - תיאור השירות הגנרי.
 * @returns אובייקט שירות AVTransport ספציפי אם ההמרה הצליחה, אחרת null.
 */
export function tryCreateAVTransportService(service: ServiceDescription): AVTransport.SpecificService | null {
    if (service.serviceType !== 'urn:schemas-upnp-org:service:AVTransport:1') {
        return null;
    }

    if (!service.actionList) {
        return null;
    }
    
    // דוגמה לפעולות חובה. ניתן להתאים לפי הצורך.
    const requiredActions = ['Play', 'Stop', 'SetAVTransportURI', 'GetTransportInfo', 'GetPositionInfo', 'GetMediaInfo'];
    for (const actionName of requiredActions) {
        if (!service.actionList.has(normalizeGenericKey(actionName))) {
             // console.warn(`AVTransport: Missing required action: ${actionName}`);
             // return null; // החזרת null אם פעולה חובה חסרה
        }
    }

    const specificService = service as AVTransport.SpecificService;
    specificService.actions = {} as AVTransport.AVTransportServiceActions;

    const setAVTransportURIAction = service.actionList.get(normalizeGenericKey('SetAVTransportURI'));
    if (setAVTransportURIAction) {
        specificService.actions.SetAVTransportURI = setAVTransportURIAction as Action & { invoke: (args: AVTransport.AVTSetAVTransportURIArgs) => Promise<Record<string, any>> };
    }

    const setNextAVTransportURIAction = service.actionList.get(normalizeGenericKey('SetNextAVTransportURI'));
    if (setNextAVTransportURIAction) {
        specificService.actions.SetNextAVTransportURI = setNextAVTransportURIAction as Action & { invoke: (args: AVTransport.AVTSetNextAVTransportURIArgs) => Promise<Record<string, any>> };
    }
    
    const playAction = service.actionList.get(normalizeGenericKey('Play'));
    if (playAction) {
        specificService.actions.Play = playAction as Action & { invoke: (args: AVTransport.AVTPlayArgs) => Promise<Record<string, any>> };
    }

    const stopAction = service.actionList.get(normalizeGenericKey('Stop'));
    if (stopAction) {
        specificService.actions.Stop = stopAction as Action & { invoke: (args: AVTransport.AVTStopArgs) => Promise<Record<string, any>> };
    }

    const pauseAction = service.actionList.get(normalizeGenericKey('Pause'));
    if (pauseAction) {
        specificService.actions.Pause = pauseAction as Action & { invoke: (args: AVTransport.AVTPauseArgs) => Promise<Record<string, any>> };
    }

    const seekAction = service.actionList.get(normalizeGenericKey('Seek'));
    if (seekAction) {
        specificService.actions.Seek = seekAction as Action & { invoke: (args: AVTransport.AVTSeekArgs) => Promise<Record<string, any>> };
    }
    
    const nextAction = service.actionList.get(normalizeGenericKey('Next'));
    if (nextAction) {
        specificService.actions.Next = nextAction as Action & { invoke: (args: { InstanceID: number }) => Promise<Record<string, any>> };
    }

    const previousAction = service.actionList.get(normalizeGenericKey('Previous'));
    if (previousAction) {
        specificService.actions.Previous = previousAction as Action & { invoke: (args: { InstanceID: number }) => Promise<Record<string, any>> };
    }

    const getTransportInfoAction = service.actionList.get(normalizeGenericKey('GetTransportInfo'));
    if (getTransportInfoAction) {
        specificService.actions.GetTransportInfo = getTransportInfoAction as Action & { invoke: (args: AVTransport.AVTGetTransportInfoArgs) => Promise<AVTransport.AVTGetTransportInfoResult> };
    }

    const getPositionInfoAction = service.actionList.get(normalizeGenericKey('GetPositionInfo'));
    if (getPositionInfoAction) {
        specificService.actions.GetPositionInfo = getPositionInfoAction as Action & { invoke: (args: AVTransport.AVTGetPositionInfoArgs) => Promise<AVTransport.AVTGetPositionInfoResult> };
    }

    const getMediaInfoAction = service.actionList.get(normalizeGenericKey('GetMediaInfo'));
    if (getMediaInfoAction) {
        specificService.actions.GetMediaInfo = getMediaInfoAction as Action & { invoke: (args: AVTransport.AVTGetMediaInfoArgs) => Promise<AVTransport.AVTGetMediaInfoResult> };
    }
    
    const getDeviceCapabilitiesAction = service.actionList.get(normalizeGenericKey('GetDeviceCapabilities'));
    if (getDeviceCapabilitiesAction) {
        specificService.actions.GetDeviceCapabilities = getDeviceCapabilitiesAction as Action & { invoke: (args: AVTransport.AVTGetDeviceCapabilitiesArgs) => Promise<AVTransport.AVTGetDeviceCapabilitiesResult> };
    }

    return specificService;
}

/**
 * @hebrew מנסה ליצור ולהחזיר שירות RenderingControl ספציפי מתיאור שירות גנרי.
 * @param service - תיאור השירות הגנרי.
 * @returns אובייקט שירות RenderingControl ספציפי אם ההמרה הצליחה, אחרת null.
 */
export function tryCreateRenderingControlService(service: ServiceDescription): RenderingControl.SpecificService | null {
    if (service.serviceType !== 'urn:schemas-upnp-org:service:RenderingControl:1') {
        return null;
    }

    if (!service.actionList) {
        return null;
    }

    // דוגמה לפעולות חובה. ניתן להתאים לפי הצורך.
    const requiredActions = ['GetMute', 'SetMute', 'GetVolume', 'SetVolume'];
    for (const actionName of requiredActions) {
        if (!service.actionList.has(normalizeGenericKey(actionName))) {
            // console.warn(`RenderingControl: Missing required action: ${actionName}`);
            // return null; // החזרת null אם פעולה חובה חסרה
        }
    }
    
    const specificService = service as RenderingControl.SpecificService;
    specificService.actions = {} as RenderingControl.RenderingControlServiceActions;

    const getMuteAction = service.actionList.get(normalizeGenericKey('GetMute'));
    if (getMuteAction) {
        specificService.actions.GetMute = getMuteAction as Action & { invoke: (args: RenderingControl.RCSGetMuteArgs) => Promise<RenderingControl.RCSGetMuteResult> };
    }

    const setMuteAction = service.actionList.get(normalizeGenericKey('SetMute'));
    if (setMuteAction) {
        specificService.actions.SetMute = setMuteAction as Action & { invoke: (args: RenderingControl.RCSSetMuteArgs) => Promise<Record<string, any>> };
    }

    const getVolumeAction = service.actionList.get(normalizeGenericKey('GetVolume'));
    if (getVolumeAction) {
        specificService.actions.GetVolume = getVolumeAction as Action & { invoke: (args: RenderingControl.RCSGetVolumeArgs) => Promise<RenderingControl.RCSGetVolumeResult> };
    }

    const setVolumeAction = service.actionList.get(normalizeGenericKey('SetVolume'));
    if (setVolumeAction) {
        specificService.actions.SetVolume = setVolumeAction as Action & { invoke: (args: RenderingControl.RCSSetVolumeArgs) => Promise<Record<string, any>> };
    }
    
    return specificService;
}

// אין טיפוס ספציפי עבור ConnectionManager ב-specificTypes.ts, לכן לא נוצרת פונקציה עבורו.
// אם יתווסף בעתיד, יש להוסיף פונקציה דומה:
// export function tryCreateConnectionManagerService(service: ServiceDescription): ConnectionManager.SpecificService | null { ... }