const publicOrigin = (import.meta.env.VITE_PUBLIC_SITE_URL || "https://spaceread.net").replace(/\/+$/, "");

/** Absolute link to a page on the public SpaceRead site. */
export function publicSiteUrl(path: string) {
    return `${publicOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}
