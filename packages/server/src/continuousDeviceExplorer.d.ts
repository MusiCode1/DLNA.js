import { EventEmitter } from 'events';
import type { ContinueDiscoveryOptions } from './types';
export declare class ContinuousDeviceExplorer extends EventEmitter {
    private discoveryOptions;
    private intervalId?;
    private isDiscovering;
    private abortController?;
    constructor(options?: Partial<ContinueDiscoveryOptions>);
    startDiscovery(): void;
    stopDiscovery(): void;
    private runDiscoveryCycle;
}
