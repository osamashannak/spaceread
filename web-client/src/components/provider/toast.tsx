import {ReactNode, useCallback, useContext, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {ToastContext, ToastOptions, ToastType} from "../../context/toast.ts";
import styles from "../../styles/components/global/toast.module.scss";

type ToastState = {
    id: number;
    message: string;
    title?: string;
    type: ToastType;
    closing: boolean;
};

const TOAST_DURATION_MS = 4200;
const TOAST_EXIT_MS = 180;

export function ToastProvider({children}: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const nextToastId = useRef(1);

    const showToast = useCallback((options: ToastOptions) => {
        const type = options.type ?? "info";

        setToast({
            id: nextToastId.current++,
            message: options.message,
            title: options.title,
            type,
            closing: false,
        });
    }, []);

    const success = useCallback((message: string, title?: string) => {
        showToast({message, title, type: "success"});
    }, [showToast]);

    const error = useCallback((message: string, title?: string) => {
        showToast({message, title, type: "error"});
    }, [showToast]);

    const info = useCallback((message: string, title?: string) => {
        showToast({message, title, type: "info"});
    }, [showToast]);

    useEffect(() => {
        if (!toast) return;

        const timeout = window.setTimeout(() => {
            dismissToast(toast.id);
        }, TOAST_DURATION_MS);

        return () => window.clearTimeout(timeout);
    }, [toast]);

    const dismissToast = (id?: number) => {
        setToast((current) => {
            if (!current || current.closing || (id && current.id !== id)) {
                return current;
            }

            return {
                ...current,
                closing: true,
            };
        });

        window.setTimeout(() => {
            setToast((current) => {
                if (!current || (id && current.id !== id)) {
                    return current;
                }

                return current.closing ? null : current;
            });
        }, TOAST_EXIT_MS);
    };

    return (
        <ToastContext.Provider value={{showToast, success, error, info}}>
            {children}

            {toast && createPortal(
                <div className={styles.toastRegion} aria-live="polite" aria-atomic="true">
                    <div className={`${styles.toast} ${styles[toast.type]} ${toast.closing ? styles.closing : ""}`} role="status">
                        <span className={styles.toastMarker}/>
                        <div className={styles.toastText}>
                            {toast.title && <strong>{toast.title}</strong>}
                            <span>{toast.message}</span>
                        </div>
                        <button
                            type="button"
                            className={styles.toastClose}
                            aria-label="Dismiss notification"
                            onClick={() => dismissToast(toast.id)}
                        >
                            ×
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
}
