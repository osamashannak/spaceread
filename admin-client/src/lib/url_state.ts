import {useCallback, useMemo} from "react";
import {useSearchParams} from "react-router-dom";

type FilterValues = Record<string, string | boolean>;

/**
 * Keeps a page's applied filters in the URL so refreshes keep them and links
 * can be shared. Only values that differ from the defaults are written.
 */
export function useUrlFilters<F extends FilterValues>(defaults: F): [F, (next: F) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const keys = Object.keys(defaults);

    // Re-derive only when one of this page's params changes, so unrelated
    // params (like the open drawer) don't create a new object and refetch.
    const signature = keys.map(key => `${key}=${searchParams.get(key) ?? ""}`).join("&");

    const filters = useMemo(() => {
        const next = {...defaults};
        for (const key of keys) {
            const raw = searchParams.get(key);
            if (raw === null) continue;
            const fallback = defaults[key];
            (next as FilterValues)[key] = typeof fallback === "boolean" ? raw === "true" : raw;
        }
        return next;
    }, [signature]);

    const setFilters = useCallback((next: F) => {
        setSearchParams(current => {
            const params = new URLSearchParams(current);
            for (const key of Object.keys(defaults)) {
                const value = next[key];
                if (value === defaults[key]) {
                    params.delete(key);
                } else {
                    params.set(key, String(value));
                }
            }
            return params;
        }, {replace: true});
    }, [setSearchParams]);

    return [filters, setFilters];
}

/** A single string value kept in the URL, removed when empty. */
export function useUrlParam(key: string): [string, (value: string, options?: { push?: boolean }) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const value = searchParams.get(key) ?? "";

    const setValue = useCallback((next: string, options: { push?: boolean } = {}) => {
        setSearchParams(current => {
            const params = new URLSearchParams(current);
            if (next) params.set(key, next); else params.delete(key);
            return params;
        }, {replace: !options.push});
    }, [key, setSearchParams]);

    return [value, setValue];
}
