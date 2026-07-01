import {EMOJI_MATCHES, type EmojiMatchEntry} from "../generated/emoji_match_data.ts";
import {getTwemojiSvgUrl} from "../twemoji_config.ts";

type EmojiTextMatch = {
    entry: EmojiMatchEntry;
    index: number;
    endIndex: number;
};

const HTML_ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
};

const candidatesByFirstCharacter = new Map<string, EmojiMatchEntry[]>();

for (const emoji of EMOJI_MATCHES) {
    const firstCharacter = Array.from(emoji.emoji)[0];
    const candidates = candidatesByFirstCharacter.get(firstCharacter) ?? [];

    candidates.push(emoji);
    candidates.sort((a, b) => b.emoji.length - a.emoji.length);
    candidatesByFirstCharacter.set(firstCharacter, candidates);
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, character => HTML_ESCAPE_MAP[character]);
}

function emojiImageHtml(entry: EmojiMatchEntry) {
    return `<img class="emoji" draggable="false" alt="${escapeHtml(entry.emoji)}" src="${escapeHtml(getTwemojiSvgUrl(entry.assetUnified))}">`;
}

function createEmojiImage(entry: EmojiMatchEntry) {
    const image = document.createElement("img");

    image.alt = entry.emoji;
    image.className = "emoji";
    image.draggable = false;
    image.src = getTwemojiSvgUrl(entry.assetUnified);

    return image;
}

export function findFirstEmoji(text: string): EmojiTextMatch | null {
    for (let index = 0; index < text.length;) {
        const codePoint = text.codePointAt(index);

        if (codePoint === undefined) {
            return null;
        }

        const character = String.fromCodePoint(codePoint);
        const candidates = candidatesByFirstCharacter.get(character);

        if (candidates) {
            const match = candidates.find(candidate => text.startsWith(candidate.emoji, index));

            if (match) {
                return {
                    entry: match,
                    index,
                    endIndex: index + match.emoji.length,
                };
            }
        }

        index += character.length;
    }

    return null;
}

function splitEmojiText(text: string) {
    const parts: Array<string | EmojiMatchEntry> = [];
    let index = 0;

    while (index < text.length) {
        const match = findFirstEmoji(text.slice(index));

        if (!match) {
            parts.push(text.slice(index));
            break;
        }

        const startIndex = index + match.index;
        const endIndex = index + match.endIndex;

        if (startIndex > index) {
            parts.push(text.slice(index, startIndex));
        }

        parts.push(match.entry);
        index = endIndex;
    }

    return parts;
}

function parseTextNode(node: Text) {
    const text = node.textContent ?? "";
    const parts = splitEmojiText(text);

    if (parts.length === 1 && typeof parts[0] === "string") {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const part of parts) {
        fragment.appendChild(typeof part === "string" ? document.createTextNode(part) : createEmojiImage(part));
    }

    node.replaceWith(fragment);
}

function canParseTextNode(node: Node) {
    const parentElement = node.parentElement;

    if (!parentElement) {
        return false;
    }

    return !parentElement.closest("script, style, textarea, img.emoji");
}

export function parseText<T extends HTMLElement | string>(value: T): T {
    if (typeof value === "string") {
        return splitEmojiText(value)
            .map(part => typeof part === "string" ? escapeHtml(part) : emojiImageHtml(part))
            .join("") as T;
    }

    const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT, {
        acceptNode: node => canParseTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const textNodes: Text[] = [];

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    textNodes.forEach(parseTextNode);

    return value;
}
