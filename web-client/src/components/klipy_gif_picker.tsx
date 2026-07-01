import {type CSSProperties, useEffect, useRef, useState} from "react";
import type {GifPreview} from "../typed/professor.ts";
import {
    fetchTrendingKlipyGifs,
    klipyApiConfigured,
    searchKlipyGifs,
    trackGifEvent
} from "../lib/klipy.ts";
import styles from "../styles/components/global/klipy_gif_picker.module.scss";

const PAGE_SIZE = 24;

export default function KlipyGifPicker(props: {
    width?: number | string;
    onGifClick: (gif: GifPreview) => void;
}) {
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<GifPreview[]>([]);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const trackedLoads = useRef<Set<string>>(new Set());

    const pickerStyle = {
        "--picker-width": typeof props.width === "number" ? `${props.width}px` : props.width,
    } as CSSProperties;

    useEffect(() => {
        if (!klipyApiConfigured()) {
            setItems([]);
            setError("GIF search is unavailable.");
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            void loadPage(undefined, false, controller.signal);
        }, query.trim() ? 250 : 0);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [query]);

    useEffect(() => {
        items.forEach(gif => {
            if (!gif.id || trackedLoads.current.has(gif.id)) return;
            trackedLoads.current.add(gif.id);
            trackGifEvent(gif, "onload");
        });
    }, [items]);

    async function loadPage(cursor: string | undefined, append: boolean, signal?: AbortSignal) {
        setLoading(true);
        setError(null);

        try {
            const trimmedQuery = query.trim();
            const result = trimmedQuery
                ? await searchKlipyGifs(trimmedQuery, {limit: PAGE_SIZE, cursor, signal})
                : await fetchTrendingKlipyGifs({limit: PAGE_SIZE, cursor, signal});

            setItems(current => append ? [...current, ...result.gifs] : result.gifs);
            setNextCursor(result.next);
        } catch {
            if (signal?.aborted) return;
            if (!append) {
                setItems([]);
            }
            setError("GIFs could not be loaded.");
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }

    return (
        <aside className={styles.picker} style={pickerStyle}>
            <form className={styles.searchForm} onSubmit={event => event.preventDefault()}>
                <input
                    className={styles.searchInput}
                    maxLength={50}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search KLIPY"
                    type="search"
                    value={query}
                />
            </form>

            <div
                className={styles.body}
                onScroll={event => {
                    const body = event.currentTarget;
                    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
                    if (!loading && nextCursor && distanceFromBottom < 120) {
                        void loadPage(nextCursor, true);
                    }
                }}
            >
                {error ? (
                    <div className={styles.state}>{error}</div>
                ) : items.length > 0 ? (
                    <div className={styles.results}>
                        <div className={styles.grid}>
                            {items.map(gif => (
                                <button
                                    aria-label={gif.title || "Select GIF"}
                                    className={styles.gifButton}
                                    key={gif.id ?? gif.url}
                                    onClick={() => {
                                        trackGifEvent(gif, "onclick");
                                        props.onGifClick(gif);
                                    }}
                                    type="button"
                                >
                                    <img alt="" draggable={false} loading="lazy" src={gif.previewUrl ?? gif.url}/>
                                </button>
                            ))}
                        </div>

                        {loading && <div className={styles.loadingMore}>Loading GIFs</div>}
                    </div>
                ) : (
                    <div className={styles.state}>{loading ? "Loading GIFs" : "No GIFs found"}</div>
                )}
            </div>

        </aside>
    );
}
