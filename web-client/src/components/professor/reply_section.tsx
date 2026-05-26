import styles from "../../styles/components/professor/review.module.scss";
import ReviewReply from "./review_reply.tsx";
import {useCallback, useEffect, useRef, useState} from "react";
import {getReviewReplies} from "../../api/professor.ts";
import {useDispatch} from "react-redux";
import {changeRepliesCount} from "../../redux/slice/professor_slice.ts";
import {useReply} from "../provider/reply.tsx";


export default function ReplySection({reviewId, comments, op, autoOpen = false}: { reviewId: string, comments: number, op: boolean, autoOpen?: boolean }) {

    const [loading, setLoading] = useState(false);
    const [moreLoading, setMoreLoading] = useState(false);
    const autoLoadStarted = useRef(false);

    const context = useReply();

    const dispatch = useDispatch();

    const unloadedReplies = comments - context.replies.length;

    const loadInitialReplies = useCallback(async () => {
        if (loading || context.replies.length) return;

        setLoading(true);
        const repliesAPI = await getReviewReplies(reviewId, []);
        context.setReplies(repliesAPI?.replies || []);
        setLoading(false);
    }, [context, loading, reviewId]);

    useEffect(() => {
        if (!autoOpen || comments <= 0 || context.replies.length || autoLoadStarted.current) return;

        autoLoadStarted.current = true;
        loadInitialReplies();
    }, [autoOpen, comments, context.replies.length, loadInitialReplies]);


    if (loading) {
        return (
            <div className={styles.viewMoreReply}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
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


    if (!context.replies.length) {
        return (
            <div className={styles.viewMoreReply} onClick={loadInitialReplies}>
                --- View {unloadedReplies} {unloadedReplies === 1 ? "reply" : "replies"}
            </div>
        )
    }


    return (
        <>
            <div className={styles.commentsSection}>
                <div className={styles.line}></div>
                <div className={styles.commentsList}>

                    {context.replies.map((reply, index) => {
                        return <ReviewReply reply={reply} key={index} reviewId={reviewId} op={op}/>
                    })}

                </div>
            </div>

            {unloadedReplies > 0 && (moreLoading ?
                <div className={styles.viewMoreReply}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
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
                : <div className={styles.viewMoreReply} onClick={async () => {
                    setMoreLoading(true);

                    const ids = context.replies.map((reply) => reply.id);

                    const repliesAPI = await getReviewReplies(reviewId, ids);

                    const newReplies = repliesAPI?.replies.filter((reply) => !context.replies.find((existingReply) => existingReply.id === reply.id));

                    context.setReplies([...context.replies, ...(newReplies || [])]);

                    if (repliesAPI?.comments) {
                        dispatch(changeRepliesCount({reviewId, count: repliesAPI.comments}));
                    }

                    setMoreLoading(false);
                }}>
                    <span>View more replies...</span>
                </div>)}
        </>
    )


}
