export const SITE_ORIGIN = "https://spaceread.net";
export const SITE_TITLE = "SpaceRead · Professor Reviews for UAE Universities";
export const SITE_DESCRIPTION = "Find professor reviews and ratings for UAE universities, and browse shared course materials on SpaceRead.";

// Match the encoded profile and course paths published in the sitemap.
export function encodePathSegment(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
