import { Request, Response, NextFunction } from 'express';
import type { ApiDevice } from './types';
export declare const handleBrowseRequest: (req: Request, res: Response, next: NextFunction, activeDevices: Map<string, ApiDevice>) => Promise<void>;
