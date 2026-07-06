import type {ClientFingerprintAPI, ClientFingerprintComponentAPI} from "../typed/professor.ts";

const FINGERPRINT_SCHEMA_VERSION = "review-browser-fingerprint-v1";
const CREEP_RUNTIME_VERSION = "creepjs-full-docs-runtime";
const THUMBMARK_TIMEOUT_MS = 2500;
const CREEP_RUNTIME_TIMEOUT_MS = 9000;
const CREEP_FRAME_URL = "/vendor/fingerprint-runtime/frame.html";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | {[key: string]: JsonValue};
type FingerprintSignals = Record<string, string | number | boolean | null>;

type CreepRuntimeWindow = Window & {
    Fingerprint?: unknown;
    Creep?: unknown;
    __fingerprintRuntimeError?: string | null;
};

type CreepRuntimeResult = {
    fingerprint: unknown;
    creep: unknown;
};

export async function collectReviewClientFingerprint(): Promise<ClientFingerprintAPI | undefined> {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return undefined;
    }

    const settled = await Promise.allSettled([
        withTimeout(collectThumbmarkFingerprint(), THUMBMARK_TIMEOUT_MS),
        withTimeout(collectCreepFingerprint(), CREEP_RUNTIME_TIMEOUT_MS),
    ]);

    const components = settled.flatMap(result => (
        result.status === "fulfilled" && result.value ? [result.value] : []
    ));

    if (components.length === 0) {
        return undefined;
    }

    return {
        version: FINGERPRINT_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        components,
    };
}

async function collectThumbmarkFingerprint(): Promise<ClientFingerprintComponentAPI | undefined> {
    const startedAt = performance.now();

    try {
        const {Thumbmark, stableStringify: stringifyThumbmark} = await import("@thumbmarkjs/thumbmarkjs");
        const thumbmark = new Thumbmark({
            logging: false,
            performance: true,
            stabilize: ["private", "iframe"],
            timeout: 1800,
        });
        const result = await thumbmark.get();

        if (!result.thumbmark) {
            return undefined;
        }

        const componentHash = await sha256Hex(stringifyThumbmark(result.components));
        const signals: FingerprintSignals = {
            components_hash: componentHash,
            component_count: Object.keys(result.components).length,
            error_count: result.error?.length ?? 0,
            timed_out: result.info?.timed_out ?? false,
        };

        return {
            source: "thumbmark",
            fingerprint: result.thumbmark,
            version: result.version,
            duration_ms: elapsedMs(startedAt),
            signals,
        };
    } catch (error) {
        return {
            source: "thumbmark",
            fingerprint: await sha256Hex(`thumbmark-error:${errorMessage(error)}`),
            duration_ms: elapsedMs(startedAt),
            error: errorMessage(error),
        };
    }
}

async function collectCreepFingerprint(): Promise<ClientFingerprintComponentAPI | undefined> {
    const startedAt = performance.now();

    try {
        const result = await runCreepRuntimeFrame();
        const fingerprintJSON = stableStringify(result.fingerprint ?? null);
        const creepJSON = stableStringify(result.creep ?? null);
        const fingerprintHash = await sha256Hex(stableStringify({
            fingerprint: result.fingerprint ?? null,
            creep: result.creep ?? null,
        }));

        const signals: FingerprintSignals = {
            fingerprint_hash: await sha256Hex(fingerprintJSON),
            creep_hash: await sha256Hex(creepJSON),
            fingerprint_keys: topLevelKeys(result.fingerprint).join(","),
            creep_keys: topLevelKeys(result.creep).join(","),
            fingerprint_key_count: topLevelKeys(result.fingerprint).length,
            creep_key_count: topLevelKeys(result.creep).length,
        };

        return {
            source: "creep",
            fingerprint: fingerprintHash,
            version: CREEP_RUNTIME_VERSION,
            duration_ms: elapsedMs(startedAt),
            signals,
        };
    } catch (error) {
        return {
            source: "creep",
            fingerprint: await sha256Hex(`creepjs-full-error:${errorMessage(error)}`),
            version: CREEP_RUNTIME_VERSION,
            duration_ms: elapsedMs(startedAt),
            error: errorMessage(error),
        };
    }
}

function runCreepRuntimeFrame(): Promise<CreepRuntimeResult> {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe");
        iframe.src = CREEP_FRAME_URL;
        iframe.title = "Fingerprint runtime";
        iframe.tabIndex = -1;
        iframe.setAttribute("aria-hidden", "true");
        iframe.style.position = "fixed";
        iframe.style.left = "-10000px";
        iframe.style.top = "0";
        iframe.style.width = "320px";
        iframe.style.height = "240px";
        iframe.style.opacity = "0";
        iframe.style.border = "0";
        iframe.style.pointerEvents = "none";

        let settled = false;
        let lastRuntimeError: string | null = null;
        let intervalId: number | undefined;
        let timeoutId: number | undefined;

        const cleanup = () => {
            if (intervalId !== undefined) window.clearInterval(intervalId);
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
            iframe.remove();
        };

        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
        };

        const readFrame = () => {
            let frameWindow: CreepRuntimeWindow | null = null;
            try {
                frameWindow = iframe.contentWindow as CreepRuntimeWindow | null;
            } catch {
                finish(() => reject(new Error("fingerprint frame is not same-origin")));
                return;
            }

            if (!frameWindow) return;

            if (frameWindow.__fingerprintRuntimeError) {
                lastRuntimeError = frameWindow.__fingerprintRuntimeError;
            }

            const fingerprint = cloneSerializable(frameWindow.Fingerprint);
            const creep = cloneSerializable(frameWindow.Creep);
            if (fingerprint || creep) {
                finish(() => resolve({fingerprint, creep}));
            }
        };

        iframe.addEventListener("load", readFrame);
        intervalId = window.setInterval(readFrame, 100);
        timeoutId = window.setTimeout(() => {
            finish(() => reject(new Error(lastRuntimeError || "creep runtime timed out")));
        }, CREEP_RUNTIME_TIMEOUT_MS);

        (document.body || document.documentElement).appendChild(iframe);
    });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: number | undefined;
    const timeout = new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("fingerprint collection timed out")), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
        }
    }
}

async function sha256Hex(value: string): Promise<string> {
    if (!crypto.subtle) {
        return fallbackHash(value);
    }

    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function fallbackHash(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
    if (value === undefined) {
        return "null";
    }

    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
        `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(",")}}`;
}

function cloneSerializable(value: unknown): JsonValue | null {
    if (value === undefined || value === null) {
        return null;
    }

    try {
        return JSON.parse(JSON.stringify(value)) as JsonValue;
    } catch {
        return null;
    }
}

function topLevelKeys(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }

    return Object.keys(value as Record<string, unknown>).sort().slice(0, 40);
}

function elapsedMs(startedAt: number): number {
    return Math.max(0, Math.round(performance.now() - startedAt));
}

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message.slice(0, 160);
    }
    return "unknown fingerprint error";
}
