import type { ServiceDescription, DiscoveryOptions } from '@dlna-tv-play/dlna-core';
/**
 * @hebrew מייצג את המידע על התקן כפי שהוא נשמר ומוצג ב-API של השרת.
 */
export interface ApiDevice {
    friendlyName: string;
    modelName: string;
    udn: string;
    remoteAddress?: string;
    lastSeen: number;
    iconUrl?: string;
    baseURL?: string;
    serviceList?: ServiceDescription[];
    supportedServices?: string[];
    presentationURL?: string;
    rootDoc: string;
}
export interface ContinueDiscoveryOptions extends DiscoveryOptions {
    continuousIntervalMs: number;
}
export interface RendererPreset {
    udn: string;
    baseURL: string;
    ipAddress: string;
    macAddress: string;
}
export interface FolderPreset {
    objectId: string;
    path?: string | null;
}
export interface MediaServerPreset {
    udn: string;
    baseURL: string;
    folder: FolderPreset;
}
export interface PresetSettings {
    renderer?: RendererPreset | null;
    mediaServer?: MediaServerPreset | null;
}
export interface AllPresetSettings {
    [presetName: string]: PresetSettings;
}
export interface PresetEntry {
    name: string;
    settings: PresetSettings;
}
