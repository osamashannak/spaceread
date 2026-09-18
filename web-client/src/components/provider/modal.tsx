import {ComponentType, ReactNode, useContext, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {ModalContext} from "../../context/modal.ts";

export function ModalProvider({ children }: { children: ReactNode }) {
    const [modal, setModal] = useState<{
        Component: ComponentType<any>;
        props: Record<string, any>;
    } | null>(null);

    const scrollPosition = useRef(0);
    const prevStyles = useRef<Map<HTMLElement, Partial<CSSStyleDeclaration>>>(new Map());

    const openModal = (Component: ComponentType<any>, props: Record<string, any> = {}) => {
        setModal({ Component, props });
    };

    const closeModal = () => setModal(null);

    useEffect(() => {
        if (!modal) return;

        scrollPosition.current = window.scrollY;

        const html = document.documentElement;
        const body = document.body;
        const elements = [html, body];

        // Save previous inline styles
        elements.forEach(el => {
            prevStyles.current.set(el, {
                overflow: el.style.overflow,
                marginRight: el.style.marginRight,
                overscrollBehaviorY: (el.style as any).overscrollBehaviorY,
            });
        });

        // Apply modal-specific styles
        const scrollBarWidth = window.innerWidth - html.clientWidth;
        html.style.overflow = "hidden";
        (html.style as any).overscrollBehaviorY = "none";
        html.style.marginRight = `${scrollBarWidth}px`;

        return () => {
            // Restore previous styles
            elements.forEach(el => {
                const prev = prevStyles.current.get(el);
                if (prev) {
                    if ("overflow" in prev) el.style.overflow = prev.overflow || "";
                    if ("marginRight" in prev) el.style.marginRight = prev.marginRight || "";
                    if ("overscrollBehaviorY" in prev) (el.style as any).overscrollBehaviorY = prev.overscrollBehaviorY || "";
                }
            });

            window.scrollTo(0, scrollPosition.current || 0);
        };
    }, [modal]);

    return (
        <ModalContext.Provider value={{ openModal, closeModal }}>
            {children}

            {modal &&
                createPortal(
                    <modal.Component {...modal.props} onClose={closeModal} />,
                    document.body
                )}
        </ModalContext.Provider>
    );
}

export function useModal() {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error("useModal must be used within ModalProvider");
    return ctx;
}
