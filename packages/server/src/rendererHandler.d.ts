import { Router } from 'express';
import type { ApiDevice } from './types';
declare const logger: import("winston").Logger;
export declare function playFolderOnRenderer(rendererUdn: string, mediaServerUdn: string, folderObjectId: string, activeDevices: Map<string, ApiDevice>, parentLogger: typeof logger): Promise<{
    success: boolean;
    message: string;
    statusCode?: number;
}>;
export declare function createRendererHandler(activeDevices: Map<string, ApiDevice>): Router;
export {};
