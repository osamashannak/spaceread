import {useEffect, useId, useRef, useState} from "react";
import styles from "../../styles/components/image_preview.module.scss";

export default function ImagePreviewModal({src, loadSrc, title, downloadUrl, onClose}: {
    src?: string;
    loadSrc?: (signal: AbortSignal) => Promise<string>;
    title?: string;
    downloadUrl?: string;
    onClose: () => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [imageUrl, setImageUrl] = useState(src);
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const label = title || "Image";
    const supportsDialog = typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";

    useEffect(() => {
        const dialog = dialogRef.current;
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (supportsDialog) dialog?.showModal();
        else {
            dialog?.setAttribute("open", "");
            dialog?.querySelector("button")?.focus();
        }
        return () => {
            if (supportsDialog) dialog?.close();
            if (trigger?.isConnected) trigger.focus();
        };
    }, [supportsDialog]);

    useEffect(() => {
        setFailed(false);
        setLoaded(false);
        if (!loadSrc) {
            setImageUrl(src);
            return;
        }

        const controller = new AbortController();
        setImageUrl(undefined);
        loadSrc(controller.signal).then(url => {
            if (!controller.signal.aborted) setImageUrl(url);
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        });

        return () => controller.abort();
    }, [src, loadSrc, attempt]);

    return (
        <>
            {!supportsDialog && <div className={styles.legacyBackdrop} onClick={onClose} aria-hidden="true"/>}
            <dialog
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-labelledby={titleId}
                aria-modal="true"
                onKeyDown={event => {
                    if (supportsDialog) return;
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onClose();
                    }
                    if (event.key === "Tab") {
                        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button, a[href]");
                        const first = controls[0];
                        const last = controls[controls.length - 1];
                        if (event.shiftKey && document.activeElement === first) {
                            event.preventDefault();
                            last?.focus();
                        } else if (!event.shiftKey && document.activeElement === last) {
                            event.preventDefault();
                            first?.focus();
                        }
                    }
                }}
                onCancel={event => {
                    event.preventDefault();
                    onClose();
                }}
                onClick={event => {
                    if (event.target === event.currentTarget) onClose();
                }}
            >
                <div className={styles.toolbar}>
                    <h2 id={titleId} className={title ? styles.title : styles.visuallyHidden}>{label}</h2>
                    <div className={styles.actions}>
                        {downloadUrl && <a className={styles.action} href={downloadUrl} target="_blank" rel="noreferrer nofollow" aria-label={`Download ${label}`} title="Download">
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>
                            </svg>
                        </a>}
                        <button className={styles.action} type="button" aria-label="Close image preview" title="Close" onClick={onClose} autoFocus>
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="m6 6 12 12M6 18 18 6"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div className={styles.stage} onClick={event => {
                    // Clicking the empty space around the image dismisses the preview.
                    if (event.target === event.currentTarget) onClose();
                }}>
                    {failed ? (
                        <div className={styles.message} role="alert">
                            <p>We couldn’t load this image.</p>
                            <button className={styles.retry} type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button>
                        </div>
                    ) : (
                        <>
                            {!loaded && <div className={styles.message} role="status">Loading image…</div>}
                            {imageUrl && (
                                <img
                                    key={`${imageUrl}:${attempt}`}
                                    className={`${styles.image} ${loaded ? styles.loaded : ""}`}
                                    src={imageUrl}
                                    alt={title ?? ""}
                                    draggable={false}
                                    onLoad={() => setLoaded(true)}
                                    onError={() => setFailed(true)}
                                />
                            )}
                        </>
                    )}
                </div>
            </dialog>
        </>
    );
}
