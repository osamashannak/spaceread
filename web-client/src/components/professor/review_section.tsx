import {Fragment} from "react";
import {ReviewAPI, SimilarProfessors} from "../../typed/professor.ts";
import styles from "../../styles/pages/professor.module.scss";
import {pluralize} from "../../utils.tsx";
import Review from "./review.tsx";
import reviewStyles from "../../styles/components/professor/review.module.scss";
import SortReviews from "./sort_reviews.tsx";
import RelatedReviews from "./related_reviews.tsx";

const RELATED_REVIEWS_INLINE_THRESHOLD = 6;
const RELATED_REVIEWS_INSERT_AFTER = 3;

export default function ReviewSection(props: { professorReviews: ReviewAPI[], focusedReviewId?: string; relatedReviews?: SimilarProfessors[] }) {

    const reviews = props.professorReviews;
    const reviewCount = reviews.length;
    const relatedReviews = props.relatedReviews || [];
    const showRelatedReviews = relatedReviews.length > 0;
    const showRelatedReviewsInline = showRelatedReviews && reviewCount >= RELATED_REVIEWS_INLINE_THRESHOLD;


    return (
        <div className={styles.commentsSection}>
            <div className={styles.sortButtonWrapper}>
                <div className={styles.commentsCount}>
                    <span>{reviewCount} {pluralize(reviewCount, "Comment")}</span>
                </div>
                <div>
                    <SortReviews/>
                </div>
            </div>


            <div className={reviewStyles.commentsList}>

                {
                    reviewCount > 0 ?
                        <>
                            {reviews.map((value, index) => (
                                <Fragment key={value.id}>
                                    <Review {...value} autoOpenReplies={props.focusedReviewId === value.id}/>
                                    {showRelatedReviewsInline && index === RELATED_REVIEWS_INSERT_AFTER - 1 && (
                                        <RelatedReviews reviews={relatedReviews}/>
                                    )}
                                </Fragment>
                            ))}
                            {showRelatedReviews && !showRelatedReviewsInline && <RelatedReviews reviews={relatedReviews}/>}
                        </>
                        : (
                            <>
                                <div className={reviewStyles.noComments}><span>There are no comments.</span></div>
                                {showRelatedReviews && <RelatedReviews reviews={relatedReviews}/>}
                            </>
                        )
                }


            </div>
        </div>
    )
}
