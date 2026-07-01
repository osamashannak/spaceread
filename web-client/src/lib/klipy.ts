import type {GifPreview} from "../typed/professor.ts";

type KlipyMediaFormat = {
    url?: string;
    preview?: string;
    dims?: number[];
};

type KlipyGif = {
    id: string;
    title?: string;
    content_description?: string;
    media_formats?: Record<string, KlipyMediaFormat | undefined>;
};

type KlipyResponse = {
    results?: KlipyGif[];
    next?: string | number;
    error?: string;
};

export type KlipyResultPage = {
    gifs: GifPreview[];
    next?: string;
};

export type GifAnalyticsEvent = "onload" | "onclick" | "onsent";

const KLIPY_ENDPOINT = "https://api.klipy.com/v2";
const CLIENT_KEY = "uaeu_space";
const DEFAULT_LIMIT = 24;

export function klipyApiConfigured() {
    return Boolean(import.meta.env.VITE_KLIPY_API_KEY);
}

export async function fetchTrendingKlipyGifs(options: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
} = {}) {
    return fetchKlipyGifs("featured", undefined, options);
}

export async function searchKlipyGifs(query: string, options: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
} = {}) {
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

async function fetchKlipyGifs(endpoint: "search" | "featured", query: string | undefined, options: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
}): Promise<KlipyResultPage> {
    const apiKey = import.meta.env.VITE_KLIPY_API_KEY;
    if (!apiKey) {
        throw new Error("Missing KLIPY API key.");
    }

    const limit = options.limit ?? DEFAULT_LIMIT;
    const url = new URL(`${KLIPY_ENDPOINT}/${endpoint}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("client_key", CLIENT_KEY);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("contentfilter", "medium");
    url.searchParams.set("media_filter", "gif,mediumgif,tinygif,nanogif");

    if (options.cursor) {
        url.searchParams.set("pos", options.cursor);
    }

    const language = getBrowserLanguage();
    if (language) {
        url.searchParams.set("locale", language);
    }

    if (endpoint === "search") {
        url.searchParams.set("q", query ?? "");
    }

    const response = await fetch(url, {signal: options.signal});
    if (!response.ok) {
        throw new Error("KLIPY request failed.");
    }

    const body = await response.json() as KlipyResponse;
    if (body.error) {
        throw new Error(body.error);
    }

    const gifs = (body.results ?? []).map(toGifPreview).filter(isGifPreview);

    return {
        gifs,
        next: gifs.length > 0 ? normalizeCursor(body.next) : undefined,
    };
}

function toGifPreview(gif: KlipyGif): GifPreview | null {
    const mediaFormats = gif.media_formats ?? {};
    const selected = mediaFormats.mediumgif
        ?? mediaFormats.gif
        ?? mediaFormats.tinygif
        ?? mediaFormats.nanogif;
    const preview = mediaFormats.tinygif
        ?? mediaFormats.nanogif
        ?? selected;

    if (!selected?.url) return null;

    const [width, height] = selected.dims ?? preview?.dims ?? [1, 1];

    return {
        provider: "klipy",
        id: gif.id,
        title: gif.title || gif.content_description || "KLIPY GIF",
        url: selected.url,
        previewUrl: preview?.url ?? preview?.preview ?? selected.preview ?? selected.url,
        width: normalizeDimension(width),
        height: normalizeDimension(height),
    };
}

function isGifPreview(gif: GifPreview | null): gif is GifPreview {
    return gif !== null;
}

function normalizeCursor(cursor: string | number | undefined) {
    if (cursor === undefined || cursor === null) return undefined;
    const normalized = String(cursor);
    return normalized && normalized !== "0" ? normalized : undefined;
}

function normalizeDimension(value: number | undefined) {
    return Number.isFinite(value) && value && value > 0 ? value : 1;
}

function getBrowserLanguage() {
    const language = navigator.language?.replace("-", "_");
    return language && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(language) ? language : undefined;
}
