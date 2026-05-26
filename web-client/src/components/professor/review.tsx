import dayjs from "dayjs";
import {GifPreview, ReviewAPI} from "../../typed/professor.ts";
import styles from "../../styles/components/professor/review.module.scss";
import {decodeHtmlEntities, formatRelativeTime, parseText, ratingToIcon} from "../../utils.tsx";
import {useEffect, useState} from "react";
import ReviewRating from "./review_rating.tsx";
import ReplySection from "./reply_section.tsx";
import ReviewOptions from "./review_options.tsx";
import {translateReview} from "../../api/professor.ts";
import {ReplyProvider} from "../provider/reply.tsx";
import ReplyComposeModal from "../modal/reply_compose_modal.tsx";
import GoogleAttribution from "../google_attribution.tsx";


export default function Review(review: ReviewAPI) {

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
        <div id={`review-${review.id}`} className={styles.reviewWrapper}>
            <article className={`${styles.review} ${review.fadeIn ? styles.fadeIn : ''}`}>
                <div className={styles.reviewInfo}>

                    <div className={styles.reviewInfoLeft}>
                        <div className={styles.reviewHead}>
                            <div className={styles.reviewInfoLeftTop}>
                                <div className={styles.authorName}>
                                    <span>{review.verified ? "UAEU Student" : review.author}</span>
                                </div>
                                {review.verified && <div className={styles.verifiedBadge} title={"The author of this review is verified as a student at UAEU."}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24">
                                        <path fill="currentColor"
                                              d="m23 12l-2.44-2.79l.34-3.69l-3.61-.82l-1.89-3.2L12 2.96L8.6 1.5L6.71 4.69L3.1 5.5l.34 3.7L1 12l2.44 2.79l-.34 3.7l3.61.82L8.6 22.5l3.4-1.47l3.4 1.46l1.89-3.19l3.61-.82l-.34-3.69zm-12.91 4.72l-3.8-3.81l1.48-1.48l2.32 2.33l5.85-5.87l1.48 1.48z"/>
                                    </svg>
                                </div>}
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
                        <div className={styles.reviewInfoRight}>
                            <div className={styles.reviewStars} title={review.score.toString()}>
                                {ratingToIcon(review.score)}
                            </div>
                            <div className={styles.recommendation}>
                                <span>{review.positive ? "Recommend" : "Not recommended"}</span>
                            </div>
                            {review.course_taken && <div className={styles.course}>
                                <span>{review.course_taken}</span>
                            </div>}
                            {review.grade_received && <div className={styles.course}>
                                <span>{review.grade_received}</span>
                            </div>}
                        </div>
                    </div>

                    <ReviewOptions review={review}/>


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

                    <p dir={"auto"} id={`review_comment_${review.id}`}>
                        {displayText}
                    </p>

                    {review.attachment && <div className={styles.imageList}>
                        <div className={styles.attachment} onClick={() => {
                                window.open(review.attachment!.url, "_blank");
                            }}>
                                <div
                                    style={{paddingBottom: `${review.attachment.height / review.attachment.width * 100}%`}}></div>
                                <div style={{backgroundImage: `url(${review.attachment.url})`}} className={styles.imageDiv}>
                                </div>
                                <img src={review.attachment.url}
                                     draggable={false}
                                     width={100}
                                     height={100}
                                     alt={""}/>
                            </div>
                    </div>}

                    {gifPreview && <div className={styles.imageList}>
                        <div className={styles.attachment}>
                            <div
                                style={{paddingBottom: `${gifPreview.height / gifPreview.width * 100}%`}}></div>
                            <div style={{backgroundImage: `url(${gifPreview.url})`}} className={styles.imageDiv}>
                            </div>
                            <img src={gifPreview.url}
                                 draggable={false}
                                 width={100}
                                 height={100}
                                 alt={""}/>
                        </div>
                    </div>}

                    {translatedText && !showOriginalText && <GoogleAttribution/>}

                </div>


                <div className={styles.reviewFooter}>
                    <div>
                        <ReviewRating dislikes={review.dislike_count} likes={review.like_count} id={review.id}
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
