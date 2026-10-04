import dayjs from "dayjs";
import {GifPreview, ReviewAPI} from "../../typed/professor.ts";
import styles from "../../styles/components/professor/review.module.scss";
import {decodeHtmlEntities, formatRelativeTime, parseText} from "../../utils.tsx";
import {useEffect, useState} from "react";
import ReviewRating from "./review_rating.tsx";
import ReplySection from "./reply_section.tsx";
import ReviewOptions from "./review_options.tsx";
import {translateReview} from "../../api/professor.ts";
import {ReplyProvider} from "../provider/reply.tsx";
import ReplyComposeModal from "../modal/reply_compose_modal.tsx";
import GoogleAttribution from "../google_attribution.tsx";
import ReviewImage from "./review_image.tsx";
import Linkify from 'linkify-react';

export default function RestrictedReview(review: ReviewAPI) {

    const [replyCompose, showReplyCompose] = useState(false);
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [showOriginalText, setShowOriginalText] = useState(false);
    const [gifPreview, setGifPreview] = useState<GifPreview | null>(null);

    const originalText = review.text.trim();
    const displayText = translatedText && !showOriginalText ? translatedText : originalText;

    useEffect(() => {
        const p = document.getElementById(`review_comment_${review.id}`);

        if (!p) return;

        parseText(p);

    }, [review.id, displayText]);

    useEffect(() => {
        if (review.gif) {
            const img = new Image();
            img.onload = () => {
                setGifPreview({
                    width: img.width,
                    height: img.height,
                    url: review.gif!
                });
            };
            img.src = review.gif;
        } else {
            setGifPreview(null);
        }
    }, [review.gif]);

    // if review is 7 days old or newer, add a new badge
    const reviewDate = new Date(review.created_at);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - reviewDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return (
        <div className={styles.reviewWrapper}>
            <article className={`${styles.review} ${review.fadeIn ? styles.fadeIn : ''}`}>


                {review.pinned && <div className={styles.pinned}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24">
                        <path fill="currentColor"
                              d="m19.184 7.805l-2.965-2.967c-2.027-2.03-3.04-3.043-4.129-2.803s-1.581 1.587-2.568 4.28l-.668 1.823c-.263.718-.395 1.077-.632 1.355a2 2 0 0 1-.36.332c-.296.213-.664.314-1.4.517c-1.66.458-2.491.687-2.804 1.23a1.53 1.53 0 0 0-.204.773c.004.627.613 1.236 1.83 2.455L6.7 16.216l-4.476 4.48a.764.764 0 0 0 1.08 1.08l4.475-4.48l1.466 1.468c1.226 1.226 1.839 1.84 2.47 1.84c.265 0 .526-.068.757-.2c.548-.313.778-1.149 1.239-2.822c.202-.735.303-1.102.515-1.399q.14-.194.322-.352c.275-.238.632-.372 1.345-.64l1.844-.693c2.664-1 3.996-1.501 4.23-2.586c.235-1.086-.77-2.093-2.783-4.107"/>
                    </svg>
                    <span>Pinned</span>
                </div>}

                <div className={styles.reviewInfo}>

                    <div className={styles.reviewInfoLeft}>
                        <div className={styles.reviewHead}>
                        <div className={styles.reviewInfoLeftTop}>
                                <div className={styles.authorName}>
                                    {review.self ? "You" : review.author}
                                </div>
                                <div className={"text-separator"}>
                                    <span>·</span>
                                </div>
                                <time
                                    dateTime={review.created_at.toString()}
                                    title={dayjs(review.created_at).format("MMM D, YYYY h:mm A")}
                                    className={styles.time}
                                >{formatRelativeTime(new Date(review.created_at))}</time>

                                {diffDays < 7 && <div className={styles.new}>
                                    <span>NEW</span>
                                </div>}
                            </div>

                        </div>
                    </div>

                    {!review.pinned && <ReviewOptions review={review}/>}


                </div>

                {review.language !== "en" && <div className={styles.translateText} onClick={() => {
                    if (translatedText) {
                        setShowOriginalText(!showOriginalText);
                        return;
                    }

                    translateReview(review.id).then((response) => {
                        if (!response) return;

                        setTranslatedText(decodeHtmlEntities(response.content));
                        setShowOriginalText(false);
                    })
                }}>
                    <span>{translatedText ? (showOriginalText ? "Show translated text" : "Show original text") : "Translate text"}</span>
                </div>}

                <div className={styles.reviewBody}>
                    <Linkify options={{
                        format: {
                            url: (value) => (value.length > 50 ? value.slice(0, 50) + "…" : value).replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
                        },
                        target: '_blank',
                        className: styles.adUrl }}>
                        <p dir={"auto"} id={`review_comment_${review.id}`}>
                            {displayText}
                        </p>
                    </Linkify>

                    {review.attachment && <ReviewImage url={review.attachment.url}
                                                     width={review.attachment.width}
                                                     height={review.attachment.height}
                                                     mimeType={review.attachment.mime_type}/>}

                    {gifPreview && <ReviewImage url={gifPreview.url} width={gifPreview.width} height={gifPreview.height}
                                             previewable={false}/>}

                    {translatedText && !showOriginalText && <GoogleAttribution/>}

                </div>


                <div className={styles.reviewFooter}>
                    <div>
                        <ReviewRating dislikes={review.dislike_count} restricted likes={review.like_count} id={review.id}
                                      self={review.rated}/>
                    </div>

                    <div className={styles.comment} onClick={() => {
                        showReplyCompose(true);
                    }} onMouseDown={(e) => {
                        e.currentTarget.classList.add(styles.buttonClick);
                    }} onMouseUp={(e) => {
                        e.currentTarget.classList.remove(styles.buttonClick);
                    }} onMouseOut={(e) => {
                        e.currentTarget.classList.remove(styles.buttonClick);
                    }}>
                        <div className={styles.commentButton}>
                            <svg width={20} height={20} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
                                      d="M12 21a9 9 0 1 0-9-9c0 1.488.36 2.89 1 4.127L3 21l4.873-1c1.236.639 2.64 1 4.127 1"/>
                            </svg>
                            <div className={styles.iconBackground}></div>
                        </div>
                        {review.reply_count > 0 && <span className={styles.commentCount}>{review.reply_count}</span>}
                    </div>

                    {review.uaeu_origin &&
                        <div className={styles.uaeuOrigin} title={"This review was posted from UAEU internet."}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24">
                                <path fill="currentColor"
                                      d="M16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2s.06-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.92 7.92 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8 8 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.7 15.7 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2"/>
                            </svg>
                            <span>UAEU</span>
                        </div>}



                </div>

            </article>
            <ReplyProvider>
                {replyCompose &&
                    <ReplyComposeModal id={review.id} author={review.author} comment={review.text} op={review.self}
                                       created_at={review.created_at} showReplyCompose={showReplyCompose}
                                       reviewId={review.id}/>}

                {review.reply_count > 0 &&
                    <ReplySection reviewId={review.id} comments={review.reply_count} op={review.self}/>}
            </ReplyProvider>

        </div>
    );
}
