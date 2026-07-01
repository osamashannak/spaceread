import {type CSSProperties, useEffect, useRef, useState} from "react";
import type {GifPreview} from "../typed/professor.ts";
import {
    fetchTrendingKlipyGifs,
    klipyApiConfigured,
    type KlipyPickerItem,
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
    const [items, setItems] = useState<KlipyPickerItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const trackedLoads = useRef<Set<string>>(new Set());

    const pickerStyle = {
        "--picker-width": typeof props.width === "number" ? `${props.width}px` : props.width,
    } as CSSProperties;

    useEffect(() => {
        scrollResultsToTop();

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
            if (gif.kind !== "gif" || !gif.id || trackedLoads.current.has(gif.id)) return;
            trackedLoads.current.add(gif.id);
            trackGifEvent(gif, "onload");
        });
    }, [items]);

    function scrollResultsToTop() {
        if (!bodyRef.current) return;

        bodyRef.current.scrollTop = 0;
    }

    async function loadPage(cursor: string | undefined, append: boolean, signal?: AbortSignal) {
        setLoading(true);
        setError(null);

        try {
            const trimmedQuery = query.trim();
            const adSlotWidth = getAdSlotWidth();
            const result = trimmedQuery
                ? await searchKlipyGifs(trimmedQuery, {adSlotWidth, limit: PAGE_SIZE, cursor, signal})
                : await fetchTrendingKlipyGifs({adSlotWidth, limit: PAGE_SIZE, cursor, signal});

            setItems(current => append ? [...current, ...result.items] : result.items);
            if (!append) {
                window.requestAnimationFrame(scrollResultsToTop);
            }
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

    function getAdSlotWidth() {
        return bodyRef.current?.clientWidth || window.innerWidth;
    }

    function getGifButtonStyle(gif: GifPreview): CSSProperties {
        return {
            aspectRatio: `${gif.width} / ${gif.height}`,
        };
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
                ref={bodyRef}
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
                            {items.map(item => item.kind === "ad" ? (
                                <div className={styles.adSlot} key={item.id}>
                                    <iframe
                                        className={styles.adFrame}
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        sandbox={
                                            item.isIframeUrl
                                                ? "allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                                                : "allow-popups allow-popups-to-escape-sandbox allow-scripts"
                                        }
                                        src={item.isIframeUrl ? item.content : undefined}
                                        srcDoc={item.isIframeUrl ? undefined : item.content}
                                        style={{height: `${item.height}px`}}
                                        title="Advertisement"
                                    />
                                </div>
                            ) : (
                                <button
                                    aria-label={item.title || "Select GIF"}
                                    className={styles.gifButton}
                                    key={item.id ?? item.url}
                                    onClick={() => {
                                        trackGifEvent(item, "onclick");
                                        props.onGifClick(item);
                                    }}
                                    style={getGifButtonStyle(item)}
                                    type="button"
                                >
                                    <img
                                        alt=""
                                        draggable={false}
                                        height={item.height}
                                        loading="lazy"
                                        src={item.previewUrl ?? item.url}
                                        width={item.width}
                                    />
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
