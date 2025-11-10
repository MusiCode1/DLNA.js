export function getProxyBaseUrl(): string {
  const base = import.meta.env.PUBLIC_PROXY_BASE_URL ?? '';
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function resolveProxyPath(path: string): string {
  const base = getProxyBaseUrl();
  if (!base) return path;
  if (!path.startsWith('/')) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

export function resolveWebSocketUrl(path = '/ws'): string {
  const base = getProxyBaseUrl();
  if (base) {
    const url = new URL(path, base);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.protocol = protocol;
    return url.toString();
  }

  if (typeof window === 'undefined') {
    return path;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${path}`;
}
