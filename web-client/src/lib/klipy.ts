import type {GifPreview} from "../typed/professor.ts";

type KlipyMediaFormat = {
    url?: string;
    preview?: string;
    dims?: number[];
    width?: number;
    height?: number;
};

type KlipyNativeFileFormat = {
    gif?: KlipyMediaFormat;
    webp?: KlipyMediaFormat;
    jpg?: KlipyMediaFormat;
    mp4?: KlipyMediaFormat;
    webm?: KlipyMediaFormat;
};

type KlipyApiItem = {
    id?: string | number;
    type?: string;
    title?: string;
    content_description?: string;
    content?: string;
    url?: string;
    width?: number;
    height?: number;
    media_formats?: Record<string, KlipyMediaFormat | undefined>;
    file?: Record<string, KlipyNativeFileFormat | undefined>;
};

type KlipyResponse = {
    results?: KlipyApiItem[];
    next?: string | number;
    error?: string;
};

type KlipyNativeResponse = {
    result?: boolean;
    data?: {
        data?: KlipyApiItem[];
        current_page?: number;
        has_next?: boolean;
    };
    error?: string;
    message?: string;
};

type FetchKlipyOptions = {
    adSlotWidth?: number;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
};

export type KlipyAdPreview = {
    kind: "ad";
    content: string;
    id: string;
    isIframeUrl: boolean;
    width: number;
    height: number;
};

export type KlipyPickerItem = ({kind: "gif"} & GifPreview) | KlipyAdPreview;

export type KlipyResultPage = {
    items: KlipyPickerItem[];
    next?: string;
};

export type GifAnalyticsEvent = "onload" | "onclick" | "onsent";

const KLIPY_LEGACY_ENDPOINT = "https://api.klipy.com/v2";
const KLIPY_NATIVE_ENDPOINT = "https://api.klipy.com/api/v1";
const CLIENT_KEY = "uaeu_space";
const DEFAULT_LIMIT = 24;
const KLIPY_CUSTOMER_ID_STORAGE_KEY = "spaceread:klipy-customer-id";
const MAX_AD_HEIGHT = 250;
const MIN_AD_SIZE = 50;

let fallbackCustomerId: string | undefined;

export function klipyApiConfigured() {
    return Boolean(import.meta.env.VITE_KLIPY_API_KEY);
}

export async function fetchTrendingKlipyGifs(options: FetchKlipyOptions = {}) {
    return fetchKlipyGifs("featured", undefined, options);
}

export async function searchKlipyGifs(query: string, options: FetchKlipyOptions = {}) {
    return fetchKlipyGifs("search", query, options);
}

export function trackGifEvent(gif: GifPreview | undefined, event: GifAnalyticsEvent) {
    const url = gif?.analytics?.[event]?.url;
    if (!url) return;

    try {
        const trackingUrl = new URL(url);
        trackingUrl.searchParams.set("ts", Date.now().toString());

        void fetch(trackingUrl.toString(), {
            keepalive: true,
            mode: "no-cors",
        }).catch(() => {});
    } catch {
        return;
    }
}

async function fetchKlipyGifs(
    endpoint: "search" | "featured",
    query: string | undefined,
    options: FetchKlipyOptions,
): Promise<KlipyResultPage> {
    const apiKey = import.meta.env.VITE_KLIPY_API_KEY;
    if (!apiKey) {
        throw new Error("Missing KLIPY API key.");
    }

    const cursor = parseCursor(options.cursor);

    if (cursor?.mode === "native") {
        return fetchNativeKlipyGifs(apiKey, endpoint, query, options, cursor.value);
    }

    if (cursor?.mode === "legacy") {
        return fetchLegacyKlipyGifs(apiKey, endpoint, query, options, cursor.value);
    }

    try {
        return await fetchNativeKlipyGifs(apiKey, endpoint, query, options);
    } catch {
        return fetchLegacyKlipyGifs(apiKey, endpoint, query, options);
    }
}

async function fetchNativeKlipyGifs(
    appKey: string,
    endpoint: "search" | "featured",
    query: string | undefined,
    options: FetchKlipyOptions,
    pageCursor?: string,
): Promise<KlipyResultPage> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const nativeEndpoint = endpoint === "search" ? "search" : "trending";
    const url = new URL(`${KLIPY_NATIVE_ENDPOINT}/${encodeURIComponent(appKey)}/gifs/${nativeEndpoint}`);
    url.searchParams.set("page", normalizePageCursor(pageCursor));
    url.searchParams.set("per_page", limit.toString());
    url.searchParams.set("content_filter", "medium");

    const language = getBrowserLanguage();
    if (language) {
        url.searchParams.set("locale", language);
    }

    if (endpoint === "search") {
        url.searchParams.set("q", query ?? "");
    }

    appendAdParameters(url, options.adSlotWidth);

    const response = await fetch(url, {signal: options.signal});
    if (!response.ok) {
        throw new Error("KLIPY request failed.");
    }

    const body = await response.json() as KlipyNativeResponse;
    if (body.error || body.message) {
        throw new Error(body.error ?? body.message);
    }

    const items = (body.data?.data ?? []).map(toPickerItem).filter(isKlipyPickerItem);
    const currentPage = body.data?.current_page ?? Number(normalizePageCursor(pageCursor));
    const next = body.data?.has_next ? formatCursor("native", String(currentPage + 1)) : undefined;

    return {
        items,
        next: items.length > 0 ? next : undefined,
    };
}

async function fetchLegacyKlipyGifs(
    apiKey: string,
    endpoint: "search" | "featured",
    query: string | undefined,
    options: FetchKlipyOptions,
    positionCursor?: string,
): Promise<KlipyResultPage> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const url = new URL(`${KLIPY_LEGACY_ENDPOINT}/${endpoint}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("client_key", CLIENT_KEY);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("contentfilter", "medium");
    url.searchParams.set("media_filter", "gif,mediumgif,tinygif,nanogif");

    if (positionCursor) {
        url.searchParams.set("pos", positionCursor);
    }

    const language = getBrowserLanguage();
    if (language) {
        url.searchParams.set("locale", language);
    }

    if (endpoint === "search") {
        url.searchParams.set("q", query ?? "");
    }

    appendAdParameters(url, options.adSlotWidth);

    const response = await fetch(url, {signal: options.signal});
    if (!response.ok) {
        throw new Error("KLIPY request failed.");
    }

    const body = await response.json() as KlipyResponse;
    if (body.error) {
        throw new Error(body.error);
    }

    const items = (body.results ?? []).map(toPickerItem).filter(isKlipyPickerItem);
    const next = normalizeCursor(body.next);

    return {
        items,
        next: items.length > 0 && next ? formatCursor("legacy", next) : undefined,
    };
}

function toPickerItem(item: KlipyApiItem): KlipyPickerItem | null {
    if (item.type === "ad") {
        return toAdPreview(item);
    }

    const gif = toGifPreview(item);
    return gif ? {...gif, kind: "gif"} : null;
}

function toAdPreview(ad: KlipyApiItem): KlipyAdPreview | null {
    const content = typeof ad.content === "string" && ad.content.trim()
        ? ad.content.trim()
        : typeof ad.url === "string" && ad.url.trim()
            ? ad.url.trim()
            : undefined;

    if (!content) return null;

    return {
        kind: "ad",
        content,
        height: clampDimension(ad.height, MAX_AD_HEIGHT),
        id: `klipy-ad-${ad.id ?? hashString(content)}`,
        isIframeUrl: isUrl(content),
        width: clampDimension(ad.width, getAdMaxWidth()),
    };
}

function toGifPreview(gif: KlipyApiItem): GifPreview | null {
    const mediaFormats = gif.media_formats ?? {};
    const selected = mediaFormats.mediumgif
        ?? mediaFormats.gif
        ?? mediaFormats.tinygif
        ?? mediaFormats.nanogif
        ?? gif.file?.md?.gif
        ?? gif.file?.sm?.gif
        ?? gif.file?.xs?.gif
        ?? gif.file?.hd?.gif;
    const preview = mediaFormats.tinygif
        ?? mediaFormats.nanogif
        ?? gif.file?.xs?.gif
        ?? gif.file?.sm?.gif
        ?? selected;

    if (!selected?.url) return null;

    const [width, height] = selected.dims
        ?? preview?.dims
        ?? [selected.width ?? preview?.width, selected.height ?? preview?.height];

    return {
        id: gif.id ? String(gif.id) : selected.url,
        title: gif.title || gif.content_description || "KLIPY GIF",
        url: selected.url,
        previewUrl: preview?.url ?? preview?.preview ?? selected.preview ?? selected.url,
        width: normalizeDimension(width),
        height: normalizeDimension(height),
    };
}

function appendAdParameters(url: URL, adSlotWidth?: number) {
    const adMaxWidth = getAdMaxWidth(adSlotWidth);

    url.searchParams.set("customer_id", getKlipyCustomerId());
    url.searchParams.set("ad-min-width", MIN_AD_SIZE.toString());
    url.searchParams.set("ad-max-width", adMaxWidth.toString());
    url.searchParams.set("ad-min-height", MIN_AD_SIZE.toString());
    url.searchParams.set("ad-max-height", MAX_AD_HEIGHT.toString());
    url.searchParams.set("ad-iframe", "1");

    appendRecommendedAdParameters(url);
}

function appendRecommendedAdParameters(url: URL) {
    const adLanguage = getAdLanguage();
    if (adLanguage) {
        url.searchParams.set("ad-language", adLanguage);
    }

    const deviceWidth = getPhysicalScreenDimension(screen.width);
    const deviceHeight = getPhysicalScreenDimension(screen.height);
    if (deviceWidth) {
        url.searchParams.set("ad-device-w", deviceWidth.toString());
    }
    if (deviceHeight) {
        url.searchParams.set("ad-device-h", deviceHeight.toString());
    }
    if (window.devicePixelRatio) {
        url.searchParams.set("ad-pxratio", window.devicePixelRatio.toString());
    }

    const os = getDeviceOs();
    if (os) {
        url.searchParams.set("ad-os", os);
    }
}

function getKlipyCustomerId() {
    try {
        const stored = localStorage.getItem(KLIPY_CUSTOMER_ID_STORAGE_KEY);
        if (stored) return stored;

        const customerId = createCustomerId();
        localStorage.setItem(KLIPY_CUSTOMER_ID_STORAGE_KEY, customerId);
        return customerId;
    } catch {
        fallbackCustomerId ??= createCustomerId();
        return fallbackCustomerId;
    }
}

function createCustomerId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function getPhysicalScreenDimension(value: number | undefined) {
    if (!Number.isFinite(value) || !value) return undefined;
    return Math.round(value * (window.devicePixelRatio || 1));
}

function getAdMaxWidth(adSlotWidth?: number) {
    const measuredWidth = adSlotWidth && adSlotWidth >= MIN_AD_SIZE ? adSlotWidth : window.innerWidth;
    return Math.max(MIN_AD_SIZE, Math.round(measuredWidth));
}

function getAdLanguage() {
    const language = navigator.language?.slice(0, 2).toUpperCase();
    return language && /^[A-Z]{2}$/.test(language) ? language : undefined;
}

function getDeviceOs() {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
    if (userAgent.includes("android")) return "android";
    if (userAgent.includes("windows")) return "windows";
    if (userAgent.includes("mac os")) return "macos";
    if (userAgent.includes("linux")) return "linux";

    return undefined;
}

function isKlipyPickerItem(item: KlipyPickerItem | null): item is KlipyPickerItem {
    return item !== null;
}

function normalizeCursor(cursor: string | number | undefined) {
    if (cursor === undefined || cursor === null) return undefined;
    const normalized = String(cursor);
    return normalized && normalized !== "0" ? normalized : undefined;
}

function parseCursor(cursor: string | undefined): {mode: "native" | "legacy"; value: string} | undefined {
    if (!cursor) return undefined;

    const [mode, ...rest] = cursor.split(":");
    const value = rest.join(":");

    if ((mode === "native" || mode === "legacy") && value) {
        return {mode, value} as {mode: "native" | "legacy"; value: string};
    }

    return {mode: "legacy" as const, value: cursor};
}

function formatCursor(mode: "native" | "legacy", value: string) {
    return `${mode}:${value}`;
}

function normalizePageCursor(cursor: string | undefined) {
    const page = Number(cursor);
    return Number.isInteger(page) && page > 0 ? page.toString() : "1";
}

function normalizeDimension(value: number | undefined) {
    return Number.isFinite(value) && value && value > 0 ? value : 1;
}

function clampDimension(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value) || !value || value < MIN_AD_SIZE) return fallback;
    return Math.min(Math.round(value), fallback);
}

function isUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function hashString(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
}

function getBrowserLanguage() {
    const language = navigator.language?.replace("-", "_");
    return language && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(language) ? language : undefined;
}
