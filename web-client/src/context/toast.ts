import {createContext} from "react";

export type ToastType = "success" | "error" | "info";

export type ToastOptions = {
    title?: string;
    message: string;
    type?: ToastType;
};

type ToastContextProps = {
    showToast: (options: ToastOptions) => void;
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
};

export const ToastContext = createContext<ToastContextProps | undefined>(undefined);
