import {Fragment, type ReactNode} from "react";
import styles from "../../styles/pages/legal.module.scss";

type LegalPageProps = {
    title: string;
    label: string;
    lastUpdated: string;
    notice?: string;
    children: ReactNode;
};

export type LegalBlock =
    | {type: "heading"; level: 2 | 3; text: string}
    | {type: "paragraph"; text: string}
    | {type: "list"; items: string[]};

const contactEmail = "contact@spaceread.net";

function PrintIcon() {
    return (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" focusable="false">
            <path fill="currentColor" d="M7 3h10v4H7zm11 7a2 2 0 0 1 2 2v5h-3v4H7v-4H4v-5a2 2 0 0 1 2-2zm-3 9v-5H9v5zm2-5h1v-2h-1zM7 9h10v2H7z"/>
        </svg>
    );
}

function renderInlineText(text: string) {
    const parts = text.split(contactEmail);

    return parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
            {part}
            {index < parts.length - 1 && (
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            )}
        </Fragment>
    ));
}

export function LegalPage({
    title,
    label,
    lastUpdated,
    notice,
    children
}: LegalPageProps) {
    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div className={styles.heroRow}>
                    <div>
                        <p className={styles.kicker}>{label}</p>
                        <h1>{title}</h1>
                    </div>

                    <div className={styles.actions} aria-label={`${title} actions`}>
                        <button className={styles.actionButton} type="button" onClick={() => window.print()}>
                            <PrintIcon/>
                            <span>Print</span>
                        </button>
                    </div>
                </div>

                <p className={styles.meta}>Last updated: {lastUpdated}</p>

                {notice && <p className={styles.notice}>{notice}</p>}
            </section>

            <article className={styles.document}>
                {children}
            </article>
        </div>
    );
}

export function LegalDocument({blocks}: {blocks: LegalBlock[]}) {
    return (
        <section className={styles.body}>
            {blocks.map((block, index) => {
                if (block.type === "heading") {
                    if (block.level === 2) {
                        return <h2 key={`${block.text}-${index}`}>{block.text}</h2>;
                    }

                    return <h3 key={`${block.text}-${index}`}>{block.text}</h3>;
                }

                if (block.type === "list") {
                    return (
                        <ul key={`list-${index}`}>
                            {block.items.map((item) => (
                                <li key={item}>{renderInlineText(item)}</li>
                            ))}
                        </ul>
                    );
                }

                return <p key={`${block.text}-${index}`}>{renderInlineText(block.text)}</p>;
            })}
        </section>
    );
}

function flushList(blocks: LegalBlock[], items: string[]) {
    if (items.length) {
        blocks.push({type: "list", items: [...items]});
        items.length = 0;
    }
}

function parseLegalMarkdown(source: string): LegalBlock[] {
    const blocks: LegalBlock[] = [];
    const listItems: string[] = [];

    source.split("\n").forEach((line) => {
        const text = line.trim();

        if (!text) {
            flushList(blocks, listItems);
            return;
        }

        if (text.startsWith("## ")) {
            flushList(blocks, listItems);
            blocks.push({type: "heading", level: 3, text: text.slice(3)});
            return;
        }

        if (text.startsWith("# ")) {
            flushList(blocks, listItems);
            blocks.push({type: "heading", level: 2, text: text.slice(2)});
            return;
        }

        if (text.startsWith("- ")) {
            listItems.push(text.slice(2));
            return;
        }

        flushList(blocks, listItems);
        blocks.push({type: "paragraph", text});
    });

    flushList(blocks, listItems);
    return blocks;
}

export function LegalMarkdownDocument({source}: {source: string}) {
    return <LegalDocument blocks={parseLegalMarkdown(source)}/>;
}
