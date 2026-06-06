export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080/api/v1";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080/ws";

export const LIVE_BUFFER_CAP = 500;
export const MAX_INFINITE_PAGES = 20;
export const DEFAULT_PAGE_SIZE = 50;

export const SCROLL_TOP_THRESHOLD_PX = 100;
export const SCROLL_BOTTOM_THRESHOLD_PX = 500;

export const WS_PING_INTERVAL_MS = 30_000;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30_000;
export const WS_RECONNECT_JITTER = 0.25;
