// src/specificTypes.ts
// קובץ זה יכיל טיפוסים ספציפיים עבור שירותי UPnP נפוצים, פעולותיהם והארגומנטים שלהם.

import type { Action, StateVariable, BaseServiceDescription } from './types'; // ייבוא טיפוסים בסיסיים

// ==========================================================================================
// === urn:schemas-upnp-org:service:ContentDirectory:1 (CDS) ===
// ==========================================================================================

export namespace ContentDirectory {
    export type CDSBrowseFlag = 'BrowseMetadata' | 'BrowseDirectChildren';

    export interface CDSBrowseArgs {
        ObjectID: string;
        BrowseFlag: CDSBrowseFlag;
        Filter: string;
        StartingIndex: number;
        RequestedCount: number;
        SortCriteria: string;
    }

    export interface CDSBrowseResult {
        Result: string; // DIDL-Lite XML content
        NumberReturned: number;
        TotalMatches: number;
        UpdateID: number;
    }

    export interface CDSSearchArgs extends CDSBrowseArgs {
        ContainerID: string; // במקום ObjectID בפעולת Search
        SearchCriteria: string;
    }

    // (CDSSearchResult זהה ל-CDSBrowseResult)
    export type CDSSearchResult = CDSBrowseResult;


    export interface CDSGetSearchCapabilitiesResult {
        SearchCaps: string;
    }

    export interface CDSGetSortCapabilitiesResult {
        SortCaps: string;
    }

    export interface CDSGetSystemUpdateIDResult {
        Id: number;
    }

    // ניתן להוסיף טיפוסים נוספים עבור פעולות אחרות של CDS

    /**
     * @hebrew ממשק לפעולות ספציפיות של שירות ContentDirectory.
     */
    export interface ContentDirectoryServiceActions {
        GetSearchCapabilities?: Action & { invoke: () => Promise<CDSGetSearchCapabilitiesResult> };
        GetSortCapabilities?: Action & { invoke: () => Promise<CDSGetSortCapabilitiesResult> };
        GetSystemUpdateID?: Action & { invoke: () => Promise<CDSGetSystemUpdateIDResult> };
        Browse?: Action & { invoke: (args: CDSBrowseArgs) => Promise<CDSBrowseResult> };
        Search?: Action & { invoke: (args: CDSSearchArgs) => Promise<CDSSearchResult> };
        // CreateObject, DestroyObject, UpdateObject, etc. can be added here
        [actionName: string]: (Action & { invoke?: (...args: any[]) => Promise<any> }) | undefined; // Index signature
    }

    /**
     * @hebrew מייצג שירות ContentDirectory עם פעולות ספציפיות.
     */
    export interface SpecificService extends BaseServiceDescription {
        serviceType: "urn:schemas-upnp-org:service:ContentDirectory:1";
        actions: ContentDirectoryServiceActions;
        // ניתן להוסיף כאן גם stateVariables ספציפיים אם נרצה
    }
}

// ==========================================================================================
// === urn:schemas-upnp-org:service:AVTransport:1 (AVT) ===
// ==========================================================================================

export namespace AVTransport {
    export interface AVTSetAVTransportURIArgs {
        InstanceID: number;
        CurrentURI: string;
        CurrentURIMetaData: string; // Usually DIDL-Lite XML
    }

    export interface AVTSetNextAVTransportURIArgs {
        InstanceID: number;
        NextURI: string;
        NextURIMetaData: string;
    }

    export interface AVTPlayArgs {
        InstanceID: number;
        Speed: string; // e.g., "1", "1/2"
    }

    export interface AVTStopArgs {
        InstanceID: number;
    }

    export interface AVTPauseArgs {
        InstanceID: number;
    }

    export interface AVTSeekArgs {
        InstanceID: number;
        Unit: 'REL_TIME' | 'TRACK_NR' | 'ABS_TIME' | 'ABS_COUNT' | 'REL_COUNT' | 'X_DLNA_REL_BYTE' | string; // string for other vendor-specific values
        Target: string; // e.g., "00:05:30" for REL_TIME, or "1" for TRACK_NR
    }

    export interface AVTGetTransportInfoArgs {
        InstanceID: number;
    }

    export type AVTTransportState =
        | 'STOPPED'
        | 'PLAYING'
        | 'PAUSED_PLAYBACK'
        | 'RECORDING'
        | 'TRANSITIONING'
        | 'NO_MEDIA_PRESENT'
        | 'PAUSED_RECORDING' // From LG TV example
        | 'LG_TRANSITIONING'; // From LG TV example

    export interface AVTGetTransportInfoResult {
        CurrentTransportState: AVTTransportState;
        CurrentTransportStatus: 'OK' | 'ERROR_OCCURRED' | string;
        CurrentSpeed: string;
    }

    export interface AVTGetPositionInfoArgs {
        InstanceID: number;
    }

    export interface AVTGetPositionInfoResult {
        Track: number;
        TrackDuration: string; // HH:MM:SS
        TrackMetaData: string; // DIDL-Lite for current track
        TrackURI: string;
        RelTime: string; // HH:MM:SS
        AbsTime: string; // HH:MM:SS or "NOT_IMPLEMENTED"
        RelCount: number;
        AbsCount: number;
    }

    export interface AVTGetMediaInfoArgs {
        InstanceID: number;
    }

    export interface AVTGetMediaInfoResult {
        NrTracks: number;
        MediaDuration: string; // HH:MM:SS
        CurrentURI: string;
        CurrentURIMetaData: string; // DIDL-Lite
        NextURI: string;
        NextURIMetaData: string;
        PlayMedium: string;
        RecordMedium: string;
        WriteStatus: string;
    }

    export interface AVTGetDeviceCapabilitiesArgs {
        InstanceID: number;
    }

    export interface AVTGetDeviceCapabilitiesResult {
        PlayMedia: string; // Comma-separated list
        RecMedia: string;  // Comma-separated list
        RecQualityModes: string; // Comma-separated list
    }


    // ניתן להוסיף טיפוסים נוספים עבור פעולות אחרות של AVT

    /**
     * @hebrew ממשק לפעולות ספציפיות של שירות AVTransport.
     */
    export interface AVTransportServiceActions {
        SetAVTransportURI?: Action & { invoke: (args: AVTSetAVTransportURIArgs) => Promise<Record<string, any>> };
        SetNextAVTransportURI?: Action & { invoke: (args: AVTSetNextAVTransportURIArgs) => Promise<Record<string, any>> };
        Play?: Action & { invoke: (args: AVTPlayArgs) => Promise<Record<string, any>> };
        Stop?: Action & { invoke: (args: AVTStopArgs) => Promise<Record<string, any>> };
        Pause?: Action & { invoke: (args: AVTPauseArgs) => Promise<Record<string, any>> };
        Seek?: Action & { invoke: (args: AVTSeekArgs) => Promise<Record<string, any>> };
        Next?: Action & { invoke: (args: { InstanceID: number }) => Promise<Record<string, any>> };
        Previous?: Action & { invoke: (args: { InstanceID: number }) => Promise<Record<string, any>> };
        GetTransportInfo?: Action & { invoke: (args: AVTGetTransportInfoArgs) => Promise<AVTGetTransportInfoResult> };
        GetPositionInfo?: Action & { invoke: (args: AVTGetPositionInfoArgs) => Promise<AVTGetPositionInfoResult> };
        GetMediaInfo?: Action & { invoke: (args: AVTGetMediaInfoArgs) => Promise<AVTGetMediaInfoResult> };
        GetDeviceCapabilities?: Action & { invoke: (args: AVTGetDeviceCapabilitiesArgs) => Promise<AVTGetDeviceCapabilitiesResult> };
        // GetCurrentTransportActions, GetTransportSettings, etc.
        [actionName: string]: (Action & { invoke?: (...args: any[]) => Promise<any> }) | undefined; // Index signature
    }

    /**
     * @hebrew מייצג שירות AVTransport עם פעולות ספציפיות.
     */
    export interface SpecificService extends BaseServiceDescription {
        serviceType: "urn:schemas-upnp-org:service:AVTransport:1";
        actions: AVTransportServiceActions;
    }
}


// ==========================================================================================
// === urn:schemas-upnp-org:service:RenderingControl:1 (RCS) ===
// ==========================================================================================
export namespace RenderingControl {
    export type RCSChannel = 'Master' | string; // string for other vendor-specific channels

    export interface RCSGetMuteArgs {
        InstanceID: number;
        Channel: RCSChannel;
    }
    export interface RCSGetMuteResult {
        CurrentMute: boolean;
    }
    export interface RCSSetMuteArgs extends RCSGetMuteArgs {
        DesiredMute: boolean;
    }

    export interface RCSGetVolumeArgs {
        InstanceID: number;
        Channel: RCSChannel;
    }
    export interface RCSGetVolumeResult {
        CurrentVolume: number; // Typically 0-100
    }
    export interface RCSSetVolumeArgs extends RCSGetVolumeArgs {
        DesiredVolume: number;
    }

    /**
     * @hebrew ממשק לפעולות ספציפיות של שירות RenderingControl.
     */
    export interface RenderingControlServiceActions {
        GetMute?: Action & { invoke: (args: RCSGetMuteArgs) => Promise<RCSGetMuteResult> };
        SetMute?: Action & { invoke: (args: RCSSetMuteArgs) => Promise<Record<string, any>> };
        GetVolume?: Action & { invoke: (args: RCSGetVolumeArgs) => Promise<RCSGetVolumeResult> };
        SetVolume?: Action & { invoke: (args: RCSSetVolumeArgs) => Promise<Record<string, any>> };
        // ListPresets, SelectPreset, GetVolumeDB, SetVolumeDB, etc.
        [actionName: string]: (Action & { invoke?: (...args: any[]) => Promise<any> }) | undefined; // Index signature
    }

    /**
     * @hebrew מייצג שירות RenderingControl עם פעולות ספציפיות.
     */
    export interface SpecificService extends BaseServiceDescription {
        serviceType: "urn:schemas-upnp-org:service:RenderingControl:1";
        actions: RenderingControlServiceActions;
    }
}
// ניתן להוסיף כאן טיפוסים עבור שירותים נוספים כמו ConnectionManager, וכו'.

// ==========================================================================================
// === ממשקים ספציפיים לשירותים (הועברו מ-types.ts) ===
// ==========================================================================================
// הבלוקים הכפולים של ה-namespace הוסרו, והממשקים SpecificService שולבו ב-namespace המתאים למעלה.