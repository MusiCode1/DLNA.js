import type { ApiDevice as ServerApiDevice } from 'dlna.js';

// This file will contain functions for communicating with the backend API.

// --- Type Definitions ---

export interface DeviceIcon {
  mimetype: string;
  width: number;
  height: number;
  depth: number;
  url: string;
}

export interface Service {
  serviceType: string;
  serviceId: string;
  controlURL: string;
  eventSubURL: string;
  SCPDURL: string;
}

// This is the client-side representation of a device, which might differ
// from the server-side representation (e.g., using a plain object for serviceList).
export type ApiDevice = Omit<ServerApiDevice, 'serviceList'> & {
  serviceList: Record<string, Service>;
};

// --- API Functions ---

const isMainServer = !(import.meta.env.DEV);

const BASE_API_URL = (isMainServer) ? "" : import.meta.env.VITE_BASE_API_URL;

/**
 * Fetches the list of discovered UPnP devices from the server.
 * The server serializes the `serviceList` Map into a plain object,
 * so the return type is adjusted to `ApiDevice[]`.
 * @returns {Promise<ApiDevice[]>} A promise that resolves to an array of devices.
 */
export async function getDevices(): Promise<ApiDevice[]> {
  const response = await fetch(BASE_API_URL + '/api/devices');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  // The server sends the devices with serviceList as a Record, not a Map.
  // We cast the result to our client-side ApiDevice type.
  return (await response.json()) as ApiDevice[];
}

// --- Types for Content Browsing ---

export interface BrowseResult {
  items: MediaItem[];
  // Add other properties like NumberReturned, TotalMatches if needed
}

export interface MediaItem {
  id: string;
  title: string;
  class: string;
  res?: string | { _: string };
  resources?: { _: string }[];
  // Add other properties from DIDL-Lite as needed
}

/**
 * Browses the content of a specific device.
 * @param udn The UDN of the media server.
 * @param objectId The ID of the object to browse.
 * @returns {Promise<BrowseResult>} A promise that resolves to the browse result.
 */
export async function browseContent(udn: string, objectId: string = '0'): Promise<BrowseResult> {
  const response = await fetch(BASE_API_URL + `/api/devices/${udn}/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ObjectID: objectId,
      BrowseFlag: 'BrowseDirectChildren',
      RequestedCount: 50,
      Filter: '*',
      StartingIndex: 0,
      SortCriteria: ''
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(errorData.message || `Failed to browse device. Status: ${response.status}`);
  }

  return await response.json();
}

/**
 * Sends a request to a renderer to play a single media item.
 * @param rendererUdn The UDN of the renderer device.
 * @param mediaServerUdn The UDN of the media server.
 * @param objectId The ID of the media item to play.
 */
export async function playItem(rendererUdn: string, mediaServerUdn: string, objectId: string): Promise<void> {
  const response = await fetch(BASE_API_URL + `/api/renderers/${rendererUdn}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaServerUdn,
      objectID: objectId
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(errorData.message || 'Failed to send play request.');
  }
}

/**
 * Sends a request to a renderer to play all items in a folder.
 * @param rendererUdn The UDN of the renderer device.
 * @param mediaServerUdn The UDN of the media server.
 * @param folderObjectId The ID of the folder to play.
 */
export async function playFolder(rendererUdn: string, mediaServerUdn: string, folderObjectId: string): Promise<void> {
  const response = await fetch(BASE_API_URL + `/api/renderers/${rendererUdn}/play-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaServerUdn,
      folderObjectID: folderObjectId
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(errorData.message || 'Failed to send play folder request.');
  }
}

/**
 * Invokes a generic action on a device's service.
 * @param udn The UDN of the device.
 * @param serviceId The ID of the service (e.g., 'AVTransport').
 * @param actionName The name of the action (e.g., 'Play', 'Pause').
 * @param args The arguments for the action.
 * @returns {Promise<any>} A promise that resolves to the action result.
 */
export async function invokeAction(
  udn: string,
  serviceId: string,
  actionName: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const response = await fetch(BASE_API_URL + `/api/devices/${udn}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId, actionName, args })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(errorData.error || 'Action failed');
  }

  return await response.json();
}

// --- Types for Presets ---

export interface RendererPreset {
  udn: string;
  baseURL: string;
  ipAddress: string;
  macAddress: string;
  broadcastAddress: string;
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

export interface PresetEntry {
  name: string;
  settings: PresetSettings;
}

// --- API Functions for Presets ---

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function getPresets(): Promise<PresetEntry[]> {
  const response = await fetch(BASE_API_URL + '/api/presets');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export async function savePreset(preset: PresetEntry): Promise<ApiResponse> {
  const response = await fetch(BASE_API_URL + '/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || `HTTP error! status: ${response.status}`);
  }
  return result;
}

export async function deletePreset(presetName: string): Promise<ApiResponse> {
  const response = await fetch(BASE_API_URL + '/api/presets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: presetName })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || `HTTP error! status: ${response.status}`);
  }
  return result;
}


export async function wakePreset(presetName: string): Promise<ApiResponse> {
  const response = await fetch(BASE_API_URL + `/api/wol/wake/${encodeURIComponent(presetName)}`, {
    method: 'POST'
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || `HTTP error! status: ${response.status}`);
  }
  return result;
}

export async function playPreset(presetName: string): Promise<ApiResponse> {
  const response = await fetch(BASE_API_URL + `/api/play-preset/${encodeURIComponent(presetName)}`, {
    method: 'GET',
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `HTTP error! status: ${response.status}`);
  }
  return result;
}