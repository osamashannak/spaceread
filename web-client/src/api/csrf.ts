const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME;

export function getCSRFToken() {
    const cookie = document.cookie
        .split(";")
        .map(value => value.trim())
        .find(value => value.startsWith(`${CSRF_COOKIE_NAME}=`));

    if (!cookie) return "";
    return decodeURIComponent(cookie.slice(CSRF_COOKIE_NAME.length + 1));
}

export function csrfHeader() {
    return {
        "X-Csrf-Token": getCSRFToken()
    };
}
