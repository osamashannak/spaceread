import wrapperStyles from "../../styles/components/professor/review_form.module.scss";
import styles from "../../styles/components/global/emoji_selector.module.scss";
import {useLexicalComposerContext} from "@lexical/react/LexicalComposerContext";
import {$insertNodes, type LexicalEditor, TextNode} from "lexical";
import {$createEmojiNode, EmojiNode} from "./emoji_node.ts";
import {type WheelEvent, useEffect, useMemo, useState} from "react";
import {getTwemojiSvgUrl} from "../../twemoji_config.ts";
import type {EmojiCategory, EmojiEntry} from "../../generated/emoji_picker_data.ts";
import {findFirstEmoji} from "../../lib/emoji.ts";

const PAGE_SIZE = 96;

type EmojiPickerData = {
    EMOJI_CATEGORIES: readonly EmojiCategory[];
    EMOJIS: readonly EmojiEntry[];
};

function findAndTransformEmoji(node: TextNode): null | TextNode {
    const text = node.getTextContent();
    const match = findFirstEmoji(text);

    if (!match) {
        return null;
    }

    const imageUrl = getTwemojiSvgUrl(match.entry.assetUnified);

    let targetNode;

    if (match.index === 0) {
        [targetNode] = node.splitText(match.endIndex);
    } else {
        [, targetNode] = node.splitText(match.index, match.endIndex);
    }

    const emojiNode = $createEmojiNode({
        emoji: match.entry.emoji,
        imageUrl
    });
    const nextNode = targetNode.getNextSibling();

    targetNode.replace(emojiNode);

    return nextNode instanceof TextNode ? nextNode : null;
}

function textNodeTransform(node: TextNode): void {
    let targetNode: TextNode | null = node;

    while (targetNode !== null) {
        if (!targetNode.isSimpleText()) {
            return;
        }

        targetNode = findAndTransformEmoji(targetNode);
    }
}

function useEmojis(editor: LexicalEditor): void {
    useEffect(() => {
        if (!editor.hasNodes([EmojiNode])) {
            throw new Error('EmojisPlugin: EmojiNode not registered on editor');
        }

        return editor.registerNodeTransform(TextNode, textNodeTransform);
    }, [editor]);
}

function normalizeQuery(value: string) {
    return value
        .toLocaleLowerCase()
        .normalize("NFKD")
        .replace(/\p{M}/gu, "");
}

function matchesQuery(emoji: EmojiEntry, terms: string[]) {
    const haystack = normalizeQuery([
        emoji.emoji,
        emoji.name,
        emoji.subgroup,
        ...emoji.keywords,
    ].join(" "));

    return terms.every(term => haystack.includes(term));
}

function getCategoryIcon(categoryKey: string, emojis: readonly EmojiEntry[]) {
    return emojis.find(emoji => emoji.category === categoryKey);
}

function stopWheelPropagation(event: WheelEvent<HTMLDivElement>) {
    const body = event.currentTarget;
    const atTop = body.scrollTop <= 0;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= 1;

    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.preventDefault();
    }

    event.stopPropagation();
}

export default function EmojiSelector(props: {open?: boolean}) {
    const [editor] = useLexicalComposerContext();
    const [hasOpened, setHasOpened] = useState(false);
    const [emojiData, setEmojiData] = useState<EmojiPickerData | null>(null);
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const open = props.open ?? false;
    const shouldMountPicker = open || hasOpened;

    useEmojis(editor);

    useEffect(() => {
        if (open) {
            setHasOpened(true);
        }
    }, [open]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [activeCategory, query]);

    useEffect(() => {
        if (!open || emojiData) return;

        let cancelled = false;

        import("../../generated/emoji_picker_data.ts").then(module => {
            if (cancelled) return;

            setEmojiData({
                EMOJI_CATEGORIES: module.EMOJI_CATEGORIES,
                EMOJIS: module.EMOJIS,
            });
            setActiveCategory(module.EMOJI_CATEGORIES[0]?.key ?? "");
        });

        return () => {
            cancelled = true;
        };
    }, [emojiData, open]);

    const filteredEmojis = useMemo(() => {
        if (!emojiData) {
            return [];
        }

        const terms = normalizeQuery(query).trim().split(/\s+/).filter(Boolean);

        if (terms.length > 0) {
            return emojiData.EMOJIS.filter(emoji => matchesQuery(emoji, terms));
        }

        return emojiData.EMOJIS.filter(emoji => emoji.category === activeCategory);
    }, [activeCategory, emojiData, query]);

    const visibleEmojis = filteredEmojis.slice(0, visibleCount);

    function insertEmoji(emoji: EmojiEntry) {
        editor.update(() => {
            $insertNodes([$createEmojiNode({
                emoji: emoji.emoji,
                imageUrl: getTwemojiSvgUrl(emoji.assetUnified)
            })]);

            editor.blur();
        });
    }

    return (
        <div
            className={wrapperStyles.emojiSelector}
            onClick={(e) => {
                e.stopPropagation();
            }}
            style={{
                opacity: open ? 1 : 0,
                pointerEvents: open ? "auto" : "none",
            }}
        >
            {shouldMountPicker && (
                <aside aria-label="Emoji picker" className={styles.picker}>
                    <form className={styles.searchForm} onSubmit={event => event.preventDefault()}>
                        <input
                            className={styles.searchInput}
                            maxLength={50}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search emoji"
                            type="search"
                            value={query}
                        />
                    </form>

                    {emojiData ? (
                        <>
                            <div className={styles.categoryTabs} role="tablist" aria-label="Emoji categories">
                                {emojiData.EMOJI_CATEGORIES.map(category => {
                                    const icon = getCategoryIcon(category.key, emojiData.EMOJIS);

                                    if (!icon) return null;

                                    return (
                                        <button
                                            aria-label={category.label}
                                            aria-selected={activeCategory === category.key}
                                            className={`${styles.categoryButton} ${activeCategory === category.key ? styles.categoryButtonActive : ""}`}
                                            key={category.key}
                                            onClick={() => {
                                                setQuery("");
                                                setActiveCategory(category.key);
                                            }}
                                            role="tab"
                                            title={category.label}
                                            type="button"
                                        >
                                            <img alt="" draggable={false} loading="lazy" src={getTwemojiSvgUrl(icon.assetUnified)}/>
                                        </button>
                                    );
                                })}
                            </div>

                            <div
                                className={styles.body}
                                onScroll={event => {
                                    const body = event.currentTarget;
                                    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;

                                    if (distanceFromBottom < 120 && visibleCount < filteredEmojis.length) {
                                        setVisibleCount(count => Math.min(count + PAGE_SIZE, filteredEmojis.length));
                                    }
                                }}
                                onWheel={stopWheelPropagation}
                            >
                                {visibleEmojis.length > 0 ? (
                                    <div className={styles.grid}>
                                        {visibleEmojis.map(emoji => (
                                            <button
                                                aria-label={emoji.name}
                                                className={styles.emojiButton}
                                                key={emoji.unified}
                                                onClick={() => insertEmoji(emoji)}
                                                onMouseDown={event => event.preventDefault()}
                                                title={emoji.name}
                                                type="button"
                                            >
                                                <img alt="" draggable={false} loading="lazy" src={getTwemojiSvgUrl(emoji.assetUnified)}/>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.state}>No emojis found</div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className={styles.state}>Loading emojis</div>
                    )}
                </aside>
            )}
        </div>
    )

}
