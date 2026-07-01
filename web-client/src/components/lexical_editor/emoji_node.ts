/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {EditorConfig, LexicalNode, NodeKey, SerializedTextNode, Spread,} from 'lexical';
import {TextNode} from 'lexical';

const FIXED_WIDTH_EMOJIS = new Set<string>([
    '\u{1FAE9}',
]);

export type SerializedEmojiNode = Spread<
    {
        emojiUrl: string,
        emojiText: string,
    },
    SerializedTextNode
>;

export class EmojiNode extends TextNode {
    __emojiURL: string;
    __emojiText: string;

    static getType(): string {
        return 'emoji';
    }

    static clone(node: EmojiNode): EmojiNode {
        return new EmojiNode(node.__emojiURL, node.__emojiText, node.__key);
    }

    constructor(url: string, text: string, key?: NodeKey) {
        super(text, key);
        this.__emojiText = text;
        this.__emojiURL = url;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement('span');
        const inner = super.createDOM(config);

        applyEmojiWrapperStyle(dom, this.__emojiURL, this.__emojiText);
        applyEmojiTextStyle(inner);
        dom.appendChild(inner);
        return dom;
    }

    updateDOM(
        prevNode: TextNode,
        dom: HTMLElement,
        config: EditorConfig,
    ): boolean {
        const inner = dom.firstChild;
        if (inner === null) {
            return true;
        }

        super.updateDOM(prevNode, inner as HTMLElement, config);
        applyEmojiWrapperStyle(dom, this.__emojiURL, this.__emojiText);
        applyEmojiTextStyle(inner as HTMLElement);
        return false;
    }

    static importJSON(serializedNode: SerializedEmojiNode): EmojiNode {
        const node = $createEmojiNode({
            imageUrl: serializedNode.emojiUrl,
            emoji: serializedNode.emojiText,
        });
        node.setFormat(serializedNode.format);
        node.setDetail(serializedNode.detail);
        node.setMode(serializedNode.mode);
        node.setStyle(serializedNode.style);
        return node;
    }

    exportJSON(): SerializedEmojiNode {
        return {
            ...super.exportJSON(),
            emojiText: this.__emojiText,
            emojiUrl: this.__emojiURL,
            type: 'emoji'
        };
    }
}

function applyEmojiWrapperStyle(dom: HTMLElement, imageUrl: string, emojiText: string): void {
    dom.setAttribute('aria-label', emojiText);
    dom.setAttribute('data-emoji', 'true');
    dom.setAttribute('role', 'img');

    dom.style.backgroundImage = `url(${imageUrl})`;
    dom.style.backgroundPosition = 'center center';
    dom.style.backgroundRepeat = 'no-repeat';
    dom.style.backgroundSize = '1em';
    dom.style.caretColor = '#111827';
    dom.style.color = 'transparent';
    dom.style.removeProperty('-webkit-text-fill-color');

    resetFixedWidthEmojiStyle(dom);

    if (FIXED_WIDTH_EMOJIS.has(emojiText)) {
        dom.style.display = 'inline-block';
        dom.style.height = '1.2em';
        dom.style.lineHeight = '1';
        dom.style.margin = '0 .075em';
        dom.style.overflow = 'hidden';
        dom.style.verticalAlign = '-0.2em';
        dom.style.width = '1.2em';
    }
}

function applyEmojiTextStyle(dom: HTMLElement): void {
    dom.style.caretColor = '#111827';
    dom.style.color = 'transparent';
    dom.style.setProperty('-webkit-text-fill-color', 'transparent');
}

function resetFixedWidthEmojiStyle(dom: HTMLElement): void {
    dom.style.removeProperty('display');
    dom.style.removeProperty('height');
    dom.style.removeProperty('line-height');
    dom.style.removeProperty('margin');
    dom.style.removeProperty('overflow');
    dom.style.removeProperty('vertical-align');
    dom.style.removeProperty('width');
}

export function $isEmojiNode(
    node: LexicalNode | null | undefined,
): node is EmojiNode {
    return node instanceof EmojiNode;
}

export function $createEmojiNode(
    emojiData: { imageUrl: string, emoji: string },
): EmojiNode {
    return new EmojiNode(emojiData.imageUrl, emojiData.emoji).setMode('token');
}
