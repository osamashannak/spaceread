export const adminAuthLostEvent = "admin-auth-lost";

const publicClientOrigin = stripTrailingSlash(import.meta.env.VITE_PUBLIC_SITE_URL || "https://spaceread.net");

export function adminLoginUrl() {
    if (typeof window === "undefined") {
        return `${publicClientOrigin}/login`;
    }

    return `${publicClientOrigin}/login?next=${encodeURIComponent(window.location.href)}`;
}

export function dispatchAdminAuthLost(status: number) {
    window.dispatchEvent(new CustomEvent(adminAuthLostEvent, {detail: {status}}));
}

function stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}
