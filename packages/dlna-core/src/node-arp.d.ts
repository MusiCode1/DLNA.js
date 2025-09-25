declare module 'node-arp' {
    export function getMAC(ip: string, callback: (err: Error | null, mac: string) => void): void;
}