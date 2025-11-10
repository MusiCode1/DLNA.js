export type ConnectionMode = 'manual' | 'list';

const MAC_REGEX = /^([0-9A-Fa-f]{2}([-:])){5}([0-9A-Fa-f]{2})$/;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function normalizeMac(mac: string): string {
  const cleaned = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (cleaned.length === 12) {
    return cleaned.match(/.{1,2}/g)!.join(':');
  }
  return mac.replace(/-/g, ':').toUpperCase();
}

export function isValidMac(mac: string | null | undefined): mac is string {
  return !!mac && MAC_REGEX.test(mac);
}

export function isValidIp(ip: string | null | undefined): ip is string {
  if (!ip || !IPV4_REGEX.test(ip)) return false;
  return ip.split('.').every((segment) => {
    const value = Number(segment);
    return value >= 0 && value <= 255;
  });
}
