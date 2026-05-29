import styles from "../../styles/components/professor/reply_compose.module.scss";
import reviewStyles from "../../styles/components/professor/review.module.scss";
import {EmojiNode} from "../lexical_editor/emoji_node.ts";
import CustomPlainTextPlugin from "../lexical_editor/custom_plaintext_plugin.tsx";
import {ContentEditable} from "@lexical/react/LexicalContentEditable";
import {HistoryPlugin} from "@lexical/react/LexicalHistoryPlugin";
import {EditorRefPlugin} from "@lexical/react/LexicalEditorRefPlugin";
import {OnChangePlugin} from "@lexical/react/LexicalOnChangePlugin";
import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {useEffect, useRef, useState} from "react";
import {LexicalEditor} from "lexical";
import dayjs from "dayjs";
import {formatRelativeTime} from "../../utils.tsx";
import {getReplyName, postReply} from "../../api/professor.ts";
import EmojiSelector from "../lexical_editor/emoji_selector.tsx";
import {useDispatch} from "react-redux";
import {addReply} from "../../redux/slice/professor_slice.ts";
import GifPicker, {ContentFilter} from "gif-picker-react";
import {GifPreview, ReplyContent, ReviewComposeProps} from "../../typed/professor.ts";
import {useReply} from "../provider/reply.tsx";
import TenorAttribution from "../tenor_attribution.tsx";
import {useToast} from "../provider/toast.tsx";


export default function ReplyComposeModal(props: ReviewComposeProps) {

    const [content, setContent] = useState<ReplyContent>({comment: "", gif: undefined});
    const commentRef = useRef<LexicalEditor | null | undefined>(null);
    const [submitting, setSubmitting] = useState(false);
    const [name, setName] = useState<string | null>(null);

    const context = useReply();
    const toast = useToast();

    const dispatch = useDispatch();


    const scrollPosition = useRef(window.scrollY);


    useEffect(() => {
        // @ts-expect-error Clarity not defined
        clarity("set", "ReplyView", "true");

        scrollPosition.current = window.scrollY;

        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

        const html = document.querySelector("html") as HTMLHtmlElement;
        html.style.overflow = "hidden";
        html.style.overscrollBehaviorY = "none";
        html.style.marginRight = `${scrollBarWidth}px`;

        return () => {
            html.style.removeProperty("overflow");
            html.style.removeProperty("margin-right");
            html.style.removeProperty("overscroll-behavior-y");

            const body = document.querySelector("body") as HTMLBodyElement;
            body.style.removeProperty("position");

            window.scrollTo(0, scrollPosition.current);
        }

    }, []);

    useEffect(() => {
        getReplyName(props.reviewId).then((n) => {
            if (!n || n === "null") {
                setName(null);
                return;
            }
            setName(n);
        });
    }, [props.reviewId]);

    let lengthStyle = styles.commentLength;

    if (content.comment.length > 350) {
        lengthStyle += ` ${styles.commentLengthWarning}`;
    } else if (content.comment.length == 350) {
        lengthStyle += ` ${styles.commentLengthPerfect}`;
    } else if (content.comment.length < 350) {
        lengthStyle += ` ${styles.commentLengthGood}`;
    }

    const formFilled = () => {
        return content.comment.trim().length > 0 || content.gif;
    }

    const handleSubmit = async () => {
        // @ts-expect-error Clarity not defined
        clarity("set", "ReplySubmitted", "true");

        setSubmitting(true);

        const reply = await postReply(props.reviewId, {
            comment: content.comment,
            gif: content.gif?.url
        }, props.mention);

        if (!reply?.id) {
            setSubmitting(false);
            // @ts-expect-error Clarity not defined
            clarity("set", "ReplyFailed", "true");
            toast.error("Reply failed to post. Please try again later.");
            return;
        }

        dispatch(addReply({reviewId: props.reviewId}));

        context.setReplies(old => {
            return [...old, {
                id: reply.id,
                reviewId: props.reviewId,
                comment: reply.comment,
                mention: reply.mention,
                created_at: reply.created_at,
                gif: reply.gif,
                author: reply.author,
                self: true,
                like_count: 0,
                liked: false,
                fadeIn: true,
                op: props.op
            }];
        })

        props.showReplyCompose(false);

    }

    function addTenorGif(gif: string) {
        const img = new Image();
        img.src = gif;

        img.onload = async () => {
            const gifPreview = {
                url: gif,
                width: img.width,
                height: img.height
            } as GifPreview;
            setContent({...content, gif: gifPreview});
        }
    }

    function toggleGifSelector() {
        const gifSelector = document.querySelector(`.${styles.gifSelector}`) as HTMLDivElement;
        if (gifSelector) {
            gifSelector.style.opacity = gifSelector.style.opacity === "0" ? "1" : "0";
            gifSelector.style.pointerEvents = gifSelector.style.pointerEvents === "none" ? "all" : "none";
        }
    }

    function hideGifSelector() {
        const gifSelector = document.querySelector(`.${styles.gifSelector}`) as HTMLDivElement;
        if (gifSelector) {
            gifSelector.style.opacity = "0";
            gifSelector.style.pointerEvents = "none";
        }
    }

    if (!name) {
        return (
            <div className={styles.replyForm}>
                <svg xmlns="http://www.w3.org/2000/svg" width="64px" height="64px" viewBox="0 0 24 24">
                    <rect width="24" height="24" fill="none"/>
                    <path fill="currentColor"
                          d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z"
                          opacity="0.5"/>
                    <path fill="currentColor" d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z">
                        <animateTransform attributeName="transform" dur="1s" from="0 12 12" repeatCount="indefinite"
                                          to="360 12 12" type="rotate"/>
                    </path>
                </svg>
            </div>
        )
    }


    if (window.innerWidth <= 768) {
        const body = document.querySelector("body") as HTMLBodyElement;
        body.style.position = "fixed";
    }

    return (
        <div className={styles.replyForm} onClick={(e) => {
            e.stopPropagation();
            props.showReplyCompose(false);
        }}>
            <div className={styles.replyFormModal} onClick={(e) => {
                e.stopPropagation()
                hideGifSelector();
            }}>
                <div className={styles.closeButton} onClick={() => props.showReplyCompose(false)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <rect width="24" height="24" fill="none"/>
                        <path fill="currentColor"
                              d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/>
                    </svg>
                </div>

                <div className={reviewStyles.replyPreview}>
                    <div className={reviewStyles.replyAuthor}>
                        <span>{props.author}</span>
                        <div className={"text-separator"}>
                            <span>·</span>
                        </div>
                        <time
                            dateTime={props.created_at.toString()}
                            title={dayjs(props.created_at).format("MMM D, YYYY h:mm A")}
                            className={reviewStyles.time}
                        >{formatRelativeTime(new Date(props.created_at))}</time>
                    </div>
                    <div>
                        <p dir={"auto"} className={reviewStyles.replyText}>{props.replyMention &&
                            <span className={reviewStyles.mention}>@{props.replyMention} </span>}{props.comment}</p>
                    </div>
                </div>
                <div className={styles.replyingTo}>
                    <span>You are replying as <span
                        className={styles.replyAuthor}>{name}{props.op && " (Author)"}</span></span>
                </div>
                {!content.gif && <LexicalComposer initialConfig={{
                    namespace: 'lexical',
                    theme: {
                        rtl: styles.postRTL,
                        ltr: styles.postLTR,
                        paragraph: styles.postParagraph,
                        link: styles.postLink
                    },
                    nodes: [EmojiNode],
                    onError: (error) => console.log(error),
                }}>

                    <div onClick={() => commentRef.current?.focus()}>
                        <div className={styles.postEditor}>
                            <CustomPlainTextPlugin
                                placeholder={<div className={styles.postPlaceholder}>Write a reply</div>}
                                contentEditable={
                                    <div className={styles.postContentContainer}>
                                        <ContentEditable style={{outline: "none"}} role={"textbox"}
                                                         spellCheck={"true"}
                                                         className={styles.postContent}/>
                                    </div>
                                }
                            />
                            <HistoryPlugin/>
                            <EditorRefPlugin editorRef={commentRef}/>
                            <OnChangePlugin onChange={(editor) => {
                                const json = editor.toJSON();

                                let f = "";

                                // @ts-expect-error LexicalEditor types are not up to date
                                json.root.children[0].children.forEach((child) => {
                                    if (child.type === "linebreak") {
                                        f += "\n";
                                    } else {
                                        f += child.text;
                                    }
                                });

                                setContent({...content, comment: f});
                            }}/>
                        </div>


                        <div className={lengthStyle}>
                            <div>
                                <span>{[...content.comment.trim()].length > 0 ? [...content.comment].length : 0}</span>
                                <span>/ 350</span>
                            </div>
                        </div>
                    </div>
                    <EmojiSelector/>
                </LexicalComposer>}

                {content.gif &&
                    <>
                        <div className={styles.imagePreview}
                             onClick={event => {
                                 event.stopPropagation();
                             }}>
                            <div className={styles.deleteButton}
                                 onClick={(event) => {
                                     event.stopPropagation();
                                        setContent({...content, gif: undefined});
                                 }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                     viewBox="0 0 256 256">
                                    <path fill="currentColor"
                                          d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128L50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/>
                                </svg>
                            </div>
                            <div style={{paddingBottom: `${(content.gif.height / content.gif.width) * 100}%`}}></div>
                            <div style={{backgroundImage: `url(${content.gif.url})`}}
                                 className={styles.imageDiv}>
                            </div>
                            <img src={content.gif.url}
                                 draggable={false}
                                 width={100}
                                 height={100}
                                 alt={""}/>
                        </div>
                        <div>
                            <TenorAttribution/>
                        </div>
                    </>}

                <div className={styles.gifSelector} onClick={e => e.stopPropagation()}>
                    <div className={styles.container2}>
                        <GifPicker tenorApiKey={"AIzaSyDmHmE9bzvu54NGyozlJFwHCwtpOFQiVng"}
                                   contentFilter={ContentFilter.HIGH}
                                   width={300}
                                   onGifClick={(gif) => {
                                       addTenorGif(gif.url);
                                       hideGifSelector();
                                   }}/>
                    </div>
                </div>
                <div className={styles.postButtonList}>
                    <div className={styles.buttonIconWrapper}>
                        <div className={styles.buttonLabel} onClick={(e) => {
                            e.stopPropagation();
                            toggleGifSelector();
                        }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                                <path fill="currentColor"
                                      d="M19 19H5V5h14zM5 3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm6.5 11h1v-4h-1zm2 0h1v-1.5H16v-1h-1.5V11h2v-1h-3zm-4-2v1h-1v-2h2c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1v2c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1z"/>
                            </svg>
                        </div>
                    </div>
                </div>

                <div className={styles.submitButtonWrapper}>
                    <div title={"Post"}
                         className={submitting ? styles.veryDisabledFormSubmit : formFilled() ? styles.enabledFormSubmit : styles.disabledFormSubmit}
                         onClick={async event => {
                             event.stopPropagation();
                             if (submitting || !formFilled()) {
                                 return;
                             }
                             await handleSubmit();
                         }}>
                        <span>Post</span>
                    </div>
                </div>

            </div>
        </div>
    )
}
