import {ReviewAPI} from "../../typed/professor.ts";
import styles from "../../styles/pages/professor.module.scss";
import {pluralize} from "../../utils.tsx";
import Review from "./review.tsx";
import reviewStyles from "../../styles/components/professor/review.module.scss";
import SortReviews from "./sort_reviews.tsx";


export default function ReviewSection(props: { professorReviews: ReviewAPI[], focusedReviewId?: string }) {

    const reviews = props.professorReviews;
    const reviewCount = reviews.length;


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
                        reviews.map(value =>
                            <Review key={value.id} {...value} autoOpenReplies={props.focusedReviewId === value.id}/>
                        )
                        : <div className={reviewStyles.noComments}><span>There are no comments.</span></div>
                }


            </div>
        </div>
    )
}
