const defaultAllowedOrigins = [
    "http://localhost:5174",
    "http://127.0.0.1:5174"
];

function getAllowedOrigins() {
    const configured = import.meta.env.VITE_ALLOWED_LOGIN_REDIRECT_ORIGINS as string | undefined;
    if (!configured) return defaultAllowedOrigins;

    return configured
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean);
}

export function getSafeLoginRedirect(rawNext: string | null = new URLSearchParams(window.location.search).get("next")) {
    if (!rawNext) return undefined;

    let parsed: URL;
    try {
        parsed = new URL(rawNext, window.location.origin);
    } catch {
        return undefined;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return undefined;
    }

    if (parsed.origin === window.location.origin || getAllowedOrigins().includes(parsed.origin)) {
        return parsed.href;
    }

    return undefined;
}

export function getLoginRedirect(defaultRedirect: string | undefined = "/professor") {
    return getSafeLoginRedirect() ?? getSafeLoginRedirect(defaultRedirect) ?? "/";
}
