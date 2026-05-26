import icons from "./icons";
import styles from "./styles/components/professor/review.module.scss";
import type {Twemoji} from "./twemoji";
import {TWEMOJI_ASSET_BASE_URL} from "./twemoji_config.ts";
import tlds from "tlds";
import {JSX} from "react";

export const URL_REGEX = new RegExp(
    "^" +
    // Protocol part (optional)
    "(?:(?:https?://)?)" +
    // Subdomain part (optional)
    "(?:[a-zA-Z0-9-]+\\.)*" +
    // Domain name part
    "(?:[a-zA-Z0-9-]+" +
    // Top-level domain part
    "(?:\\." + tlds.join("|\\.") + ")" +
    ")" +
    // Port part (optional)
    "(?::\\d+)?" +
    // Path part (optional)
    "(?:/[a-zA-Z0-9-._~:/?#[\\]@!$&'()*+,;=%]*)?" +
    "$"
);


const FullStar = () => (
    <svg className={styles.star} xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24">
        <path fill="currentColor"
              d="m5.825 22l1.625-7.025L2 10.25l7.2-.625L12 3l2.8 6.625l7.2.625l-5.45 4.725L18.175 22L12 18.275Z"/>
    </svg>
)
const HalfStar = () => (
    <svg className={styles.star} xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24">
        <path fill="currentColor"
              d="M12 8.125v7.8l3.15 1.925l-.825-3.6l2.775-2.4l-3.65-.325ZM5.825 22l1.625-7.025L2 10.25l7.2-.625L12 3l2.8 6.625l7.2.625l-5.45 4.725L18.175 22L12 18.275Z"/>
    </svg>
)
const EmptyStar = () => (
    <svg className={styles.star} xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24">
        <path fill="currentColor"
              d="m8.85 17.825l3.15-1.9l3.15 1.925l-.825-3.6l2.775-2.4l-3.65-.325l-1.45-3.4l-1.45 3.375l-3.65.325l2.775 2.425ZM5.825 22l1.625-7.025L2 10.25l7.2-.625L12 3l2.8 6.625l7.2.625l-5.45 4.725L18.175 22L12 18.275ZM12 13.25Z"/>
    </svg>
)

export const ratingToIcon = (rating: number) => {
    let i;
    rating = Math.round(rating * 2) / 2;
    const output = [];

    for (i = rating; i >= 1; i--) {
        output.push(<FullStar key={Math.random()}/>);
    }
    if (i === .5) {
        output.push(<HalfStar key={Math.random()}/>);
    }
    for (let i = (5 - rating); i >= 1; i--) {
        output.push(<EmptyStar key={Math.random()}/>);
    }

    return output;
}

export const formatBytes = (bytes: number, decimals: number = 1) => {
    if (!+bytes) return '0 B'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const iconClasses = {
    // Media
    "image": icons.image,
    "audio": icons.audio,
    "video": icons.video,
    // Documents
    "application/pdf": icons.pdf,
    "application/msword": icons.word,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": icons.word,
    "application/vnd.ms-powerpoint": icons.powerpoint,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": icons.powerpoint,
    "application/vnd.ms-excel": icons.excel,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": icons.excel,
    // Archives
    "application/gzip": icons.archive,
    "application/zip": icons.archive,
    "application/x-7z-compressed": icons.archive,
    "application/vnd.rar": icons.archive
};

export function getIconFromMIME(mimeType: string): JSX.Element {

    const candidate = Object.entries(iconClasses).find(([key]) => {
        return mimeType.startsWith(key);
    });

    if (candidate === undefined) {
        return icons.file;
    } else {
        return candidate[1];
    }
}

export const formatRelativeTime = (inputDate: Date) => {

    const now = new Date();
    const diff = Math.abs(now.getTime() - inputDate.getTime());
    const diffDays = Math.floor(diff / (1000 * 3600 * 24));

    if (diffDays > 7) {
        // format in d/mm/yy without time. the year must be 2 digits
        const day = inputDate.getDate();
        const month = inputDate.getMonth() + 1;
        const year = inputDate.getFullYear().toString().slice(-2);
        return day + "/" + month + "/" + year;
    }

    if (diffDays >= 1 && diffDays <= 7) {
        return diffDays + "d";
    }

    const diffHours = Math.floor(diff / (1000 * 3600));
    if (diffHours >= 1 && diffHours <= 24) {
        return diffHours + "h";
    }

    const diffMinutes = Math.floor(diff / (1000 * 60));
    if (diffMinutes >= 1 && diffMinutes <= 60) {
        return diffMinutes + "m";
    }

    const diffSeconds = Math.floor(diff / (1000));

    if (diffSeconds < 10) {
        return "now";
    }

    return diffSeconds + "s";
}

export const convertArabicNumeral = (s: any) => s.replace(/[٠-٩]/g, (d: any) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

export const pluralize = (count: number, noun: string) => `${noun}${count !== 1 ? "s" : ''}`;

export const decodeHtmlEntities = (value: string) => {
    const parser = new DOMParser();
    return parser.parseFromString(value, "text/html").documentElement.textContent ?? value;
}


type TwemojiWindow = Window & typeof globalThis & {
    twemoji?: Twemoji;
};

const getTwemoji = () => {
    if (typeof window === "undefined") return undefined;

    return (window as TwemojiWindow).twemoji;
}

export const parseText = <T extends HTMLElement | string>(text: T): T => {
    const twemoji = getTwemoji();

    if (!twemoji) return text;

    return twemoji.parse(text, {
        base: TWEMOJI_ASSET_BASE_URL,
        folder: 'svg',
        ext: '.svg',
    });
}


export const isPasswordValid = (password: string) => {

    if (password.length < 8 || password.length > 256) {
        return "Password must be between 8 and 256 characters long."
    }

    return true;
}

export const isEmailValid = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    return emailRegex.test(email);
}

export const isUsernameValid = (username: string) => {
    if (username.match(/[\u0080-\uFFFF]/)) {
        return "Username cannot contain unicode characters."
    }

    if (username.match(/\s/)) {
        return "Username cannot contain spaces."
    }

    if (!username.match(/^[A-Za-z0-9_-]+$/)) {
        return "Username can only contain letters, numbers, underscores, and hyphens."
    }

    if (username.length < 3 || username.length > 20) {
        return "Username must be between 3 and 20 characters long."
    }

    return true;
}
