import {useEffect, useId, useRef, useState} from "react";
import {getDownloadLink, getPreviewLink} from "../../api/course.ts";
import {CourseFileAPI} from "../../typed/course.ts";
import {formatBytes} from "../../utils.tsx";
import styles from "../../styles/components/course/pdf_preview.module.scss";

export default function PdfPreviewModal({file, onClose}: {file: CourseFileAPI; onClose: () => void}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [previewUrl, setPreviewUrl] = useState<string>();
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const canEmbed = typeof navigator.pdfViewerEnabled !== "boolean" || navigator.pdfViewerEnabled;
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
        const controller = new AbortController();
        setPreviewUrl(undefined);
        setFailed(false);
        setLoaded(false);

        getPreviewLink(file.id, controller.signal).then(url => {
            if (!controller.signal.aborted) setPreviewUrl(url);
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        });

        return () => controller.abort();
    }, [file.id, attempt]);

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
                        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], iframe");
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
                    if (event.target !== event.currentTarget) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    if (event.clientX < bounds.left || event.clientX > bounds.right
                        || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
                }}
            >
                <div className={styles.header}>
                    <div className={styles.details}>
                        <h2 id={titleId}>{file.name}</h2>
                        <p>PDF preview <span aria-hidden="true">·</span> {formatBytes(file.size)}</p>
                    </div>
                    <button className={styles.close} type="button" aria-label="Close PDF preview" onClick={onClose} autoFocus>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m6 6 12 12M6 18 18 6"/>
                        </svg>
                    </button>
                </div>
                <div className={styles.viewer}>
                    {failed ? (
                        <div className={styles.message} role="alert">
                            <p>We couldn’t load this PDF preview.</p>
                            <p className={styles.hint}>Try again, or download the file to read it.</p>
                            <button className={styles.retry} type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button>
                        </div>
                    ) : !canEmbed && previewUrl ? (
                        <div className={styles.message}>
                            <p>Your browser can’t display a PDF in this window.</p>
                            <a className={styles.retry} href={previewUrl} target="_blank" rel="noreferrer nofollow">Open PDF in a new tab</a>
                        </div>
                    ) : (
                        <>
                            {!loaded && <div className={styles.message} role="status">Loading PDF preview…</div>}
                            {previewUrl && (
                                <iframe
                                    className={styles.frame}
                                    title={`PDF preview: ${file.name}`}
                                    src={`${previewUrl}#view=FitH`}
                                    onLoad={() => setLoaded(true)}
                                    onError={() => setFailed(true)}
                                />
                            )}
                        </>
                    )}
                </div>
                <div className={styles.footer}>
                    <div className={styles.fallback}>
                        {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer nofollow">Open in new tab</a>}
                        {previewUrl && <button type="button" onClick={() => setAttempt(value => value + 1)}>Reload preview</button>}
                    </div>
                    <a className={styles.download} href={getDownloadLink(file.id)} target="_blank" rel="noreferrer nofollow">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>
                        </svg>
                        Download PDF
                    </a>
                </div>
            </dialog>
        </>
    );
}
