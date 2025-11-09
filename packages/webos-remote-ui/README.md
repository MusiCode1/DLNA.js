# WebOS Remote UI

This package contains the SvelteKit frontend that replaces the legacy static UI in `packages/proxy-server/public`.

## Getting started

```bash
bun install
bun run dev
```

The UI proxies API requests to the proxy server. During development you can run the backend with `bun run start` from the repository root and then start the UI via:

```bash
bun run dev
```

> The root `package.json` exposes the commands `dev`, `build`, `preview`, and `check` that map to this workspace.

## הוראות מהירות בעברית

1. הרץ `bun install` בתיקיית השורש של הפרויקט כדי להוריד את כל התלויות (גם של ממשק המשתמש וגם של שאר החבילות).
2. לאחר ההתקנה, הפעל את שרת הפיתוח של הממשק עם `bun run --cwd packages/webos-remote-ui dev` או פשוט `bun run dev` מתיקיית השורש.
3. אם מתקבלת השגיאה `Invalid command: dev`, ודא שההתקנה הצליחה (כלומר שנוצרו תיקיות `node_modules` וקובץ `bun.lock`/`bun.lockb`). במקרה הצורך מחק את התיקיה `node_modules` והרץ שוב `bun install`.
4. להפעלת הבקאנד במקביל (נדרש לחיבור לטלוויזיה), הרץ `bun run start` מתיקיית השורש בחלון טרמינל נוסף.

## Environment variables

| Variable | Description |
| --- | --- |
| `PUBLIC_PROXY_BASE_URL` | Optional base URL for API, proxy, and WebSocket requests when the UI is served from a different origin. Leave empty to use relative paths during local development. |

Copy `.env.example` to `.env` if you need to override the defaults.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the Vite development server with API/WebSocket proxies configured for the Bun/Hono backend. |
| `bun run build` | Build the static site into `packages/proxy-server/public/ui-build`. |
| `bun run preview` | Preview the built site locally. |
| `bun run check` | Run `svelte-check` and the Vitest suite with coverage reports. |

## Tests

The Vitest suite exercises the typed stores and services introduced during the migration:

- `connectionStore` persisting manual settings and status updates.
- `tvListStore` caching behaviour and network fallbacks.
- `powerStateStore` orchestration of wake checks.

Run the tests with:

```bash
bun run --cwd packages/webos-remote-ui test
```
