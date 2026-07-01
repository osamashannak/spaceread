/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {EditorConfig, LexicalNode, NodeKey, SerializedLexicalNode, Spread,} from 'lexical';
import {DecoratorNode} from 'lexical';

export type SerializedEmojiNode = Spread<
    {
        emojiUrl: string,
        emojiText: string,
    },
    SerializedLexicalNode
>;

export class EmojiNode extends DecoratorNode<null> {
    __emojiURL: string;
    __emojiText: string;

    static getType(): string {
        return 'emoji';
    }

    static clone(node: EmojiNode): EmojiNode {
        return new EmojiNode(node.__emojiURL, node.__emojiText, node.__key);
    }

    constructor(url: string, text: string, key?: NodeKey) {
        super(key);
        this.__emojiText = text;
        this.__emojiURL = url;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement('span');

        applyEmojiDOMStyle(dom, this.__emojiURL, this.__emojiText, config);
        return dom;
    }

    updateDOM(
        _prevNode: EmojiNode,
        dom: HTMLElement,
        config: EditorConfig,
    ): boolean {
        applyEmojiDOMStyle(dom, this.__emojiURL, this.__emojiText, config);
        return false;
    }

    static importJSON(serializedNode: SerializedEmojiNode): EmojiNode {
        const node = $createEmojiNode({
            imageUrl: serializedNode.emojiUrl,
            emoji: serializedNode.emojiText,
        });
        return node;
    }

    exportJSON(): SerializedEmojiNode {
        return {
            ...super.exportJSON(),
            emojiText: this.__emojiText,
            emojiUrl: this.__emojiURL,
            type: 'emoji',
            version: 1
        };
    }

    getTextContent(): string {
        return this.__emojiText;
    }

    isKeyboardSelectable(): boolean {
        return false;
    }

    decorate(): null {
        return null;
    }
}

function applyEmojiDOMStyle(dom: HTMLElement, imageUrl: string, emojiText: string, _config: EditorConfig): void {
    dom.setAttribute('aria-label', emojiText);
    dom.setAttribute('data-emoji', 'true');
    dom.setAttribute('role', 'img');

    dom.style.backgroundImage = `url(${imageUrl})`;
    dom.style.backgroundPosition = 'center center';
    dom.style.backgroundRepeat = 'no-repeat';
    dom.style.backgroundSize = '1em';
    dom.style.caretColor = '#111827';
    dom.style.display = 'inline-block';
    dom.style.height = '1.2em';
    dom.style.lineHeight = '1';
    dom.style.margin = '0 .075em';
    dom.style.overflow = 'hidden';
    dom.style.verticalAlign = '-0.2em';
    dom.style.width = '1.2em';
}

export function $isEmojiNode(
    node: LexicalNode | null | undefined,
): node is EmojiNode {
    return node instanceof EmojiNode;
}

export function $createEmojiNode(
    emojiData: { imageUrl: string, emoji: string },
): EmojiNode {
    return new EmojiNode(emojiData.imageUrl, emojiData.emoji);
}
