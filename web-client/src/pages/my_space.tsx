import styles from "../styles/pages/my_space.module.scss";
import {Helmet} from "@dr.pogodin/react-helmet";
import {Link} from "react-router-dom";
import {type ReactNode, useEffect, useMemo, useState} from "react";
import {getMySpace} from "../api/my_space.ts";
import {
    MySpaceAPI,
    MySpaceReplyAPI,
    MySpaceReviewAPI,
    MySpaceUploadAPI
} from "../typed/my_space.ts";
import {useAppSelector} from "../redux/hooks.ts";
import {formatBytes, formatRelativeTime, pluralize} from "../utils.tsx";

export default function MySpace() {
    const userStatus = useAppSelector(state => state.user.status);
    const [mySpace, setMySpace] = useState<MySpaceAPI>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (userStatus === "loading") return;

        if (userStatus !== "authenticated") {
            setMySpace(undefined);
            setError(false);
            setLoading(false);
            return;
        }

        let active = true;
        setLoading(true);
        setError(false);

        getMySpace().then(result => {
            if (!active) return;

            if (result.status === "ok") {
                setMySpace(result.data);
                setLoading(false);
                return;
            }

            setMySpace(undefined);
            setError(result.status !== "unauthorized");
            setLoading(false);
        });

        return () => {
            active = false;
        };
    }, [userStatus]);

    const loginTarget = useMemo(() => {
        if (typeof window === "undefined") return "/login";
        return `/login?next=${encodeURIComponent(`${window.location.origin}/my-space`)}`;
    }, []);

    const empty = mySpace
        && mySpace.summary.reviews === 0
        && mySpace.summary.replies === 0
        && mySpace.summary.uploads === 0;

    return (
        <>
            <Helmet>
                <title>My Space - SpaceRead</title>
            </Helmet>

            <div className={styles.mySpacePage}>
                <section className={styles.head}>
                    <div>
                        <h1>My Space</h1>
                        {mySpace && <span>@{mySpace.user.username}</span>}
                    </div>
                </section>

                {loading && <StatusPanel icon={<UserIcon/>} text={"Loading your space..."}/>}

                {!loading && userStatus !== "authenticated" && (
                    <section className={styles.guestPanel}>
                        <span className={styles.panelIcon}>
                            <UserIcon/>
                        </span>
                        <div>
                            <h2>Sign in to open My Space</h2>
                            <p>Your reviews, replies, uploads, and notifications will appear here.</p>
                            <Link to={loginTarget}>Sign in</Link>
                        </div>
                    </section>
                )}

                {!loading && error && (
                    <StatusPanel icon={<UserIcon/>} text={"Could not load My Space. Refresh the page and try again."}/>
                )}

                {!loading && !error && mySpace && (
                    <>
                        <section className={styles.summaryGrid} aria-label={"My Space summary"}>
                            <SummaryTile label={"Reviews"} value={mySpace.summary.reviews}/>
                            <SummaryTile label={"Replies"} value={mySpace.summary.replies}/>
                            <SummaryTile label={"Uploads"} value={mySpace.summary.uploads}/>
                            <SummaryTile label={"Pending"} value={mySpace.summary.pending_uploads}/>
                            <SummaryTile label={"Unread"} value={mySpace.summary.unread_notifications}/>
                        </section>

                        {empty && (
                            <section className={styles.emptyPanel}>
                                <span className={styles.panelIcon}>
                                    <UserIcon/>
                                </span>
                                <div>
                                    <h2>No activity yet</h2>
                                    <p>Start with a professor review or a course material upload.</p>
                                    <div className={styles.emptyActions}>
                                        <Link to={"/professor"}>Rate Professor</Link>
                                        <Link to={"/course"}>Course Materials</Link>
                                    </div>
                                </div>
                            </section>
                        )}

                        {!empty && (
                            <div className={styles.sections}>
                                <ActivitySection
                                    title={"Latest Reviews"}
                                    count={mySpace.summary.reviews}
                                    emptyText={"No reviews yet."}
                                >
                                    {mySpace.reviews.map(review => <ReviewItem key={review.id} review={review}/>)}
                                </ActivitySection>

                                <ActivitySection
                                    title={"Latest Replies"}
                                    count={mySpace.summary.replies}
                                    emptyText={"No replies yet."}
                                >
                                    {mySpace.replies.map(reply => <ReplyItem key={reply.id} reply={reply}/>)}
                                </ActivitySection>

                                <ActivitySection
                                    title={"Course Uploads"}
                                    count={mySpace.summary.uploads}
                                    emptyText={"No uploads yet."}
                                >
                                    {mySpace.uploads.map(upload => <UploadItem key={upload.id} upload={upload}/>)}
                                </ActivitySection>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

function SummaryTile({label, value}: { label: string; value: number }) {
    return (
        <div className={styles.summaryTile}>
            <strong>{value}</strong>
            <span>{label}</span>
        </div>
    );
}

function ActivitySection(props: { title: string; count: number; emptyText: string; children: ReactNode[] }) {
    return (
        <section className={styles.activitySection}>
            <div className={styles.sectionHead}>
                <h2>{props.title}</h2>
                <span>{props.count} {pluralize(props.count, "item")}</span>
            </div>
            {props.children.length > 0 ? props.children : <p className={styles.sectionEmpty}>{props.emptyText}</p>}
        </section>
    );
}

function ReviewItem({review}: { review: MySpaceReviewAPI }) {
    const details = [
        `${review.score}/5`,
        review.positive ? "Positive" : "Critical",
        `${review.reply_count} ${pluralize(review.reply_count, "reply")}`,
    ];
    if (review.course_taken) details.push(review.course_taken);
    if (review.grade_received) details.push(`Grade ${review.grade_received}`);

    return (
        <Link className={styles.activityItem} to={`/professor/${encodeURIComponent(review.professor_email)}`}>
            <div className={styles.itemTopLine}>
                <strong>{review.professor_name || review.professor_email}</strong>
                <time>{formatRelativeTime(new Date(review.created_at))}</time>
            </div>
            <p>{trimText(review.text)}</p>
            <div className={styles.itemMeta}>
                {details.map(detail => <span key={detail}>{detail}</span>)}
            </div>
            <div className={styles.itemFooter}>
                <StatusBadge status={review.status}/>
                <span>{review.like_count} likes</span>
                <span>{review.dislike_count} dislikes</span>
            </div>
        </Link>
    );
}

function ReplyItem({reply}: { reply: MySpaceReplyAPI }) {
    return (
        <Link className={styles.activityItem} to={`/professor/${encodeURIComponent(reply.professor_email)}`}>
            <div className={styles.itemTopLine}>
                <strong>{reply.professor_name || reply.professor_email}</strong>
                <time>{formatRelativeTime(new Date(reply.created_at))}</time>
            </div>
            <p>{trimText(reply.comment)}</p>
            {reply.review_preview && <span className={styles.replyContext}>{trimText(reply.review_preview, "Review has no text.")}</span>}
            <div className={styles.itemFooter}>
                <StatusBadge status={reply.status}/>
                <span>{reply.like_count} likes</span>
            </div>
        </Link>
    );
}

function UploadItem({upload}: { upload: MySpaceUploadAPI }) {
    return (
        <Link className={styles.activityItem} to={`/course/${encodeURIComponent(upload.course_tag)}`}>
            <div className={styles.itemTopLine}>
                <strong>{upload.name}</strong>
                <time>{formatRelativeTime(new Date(upload.created_at))}</time>
            </div>
            <div className={styles.itemMeta}>
                <span>{upload.course_tag}</span>
                {upload.course_name && <span>{upload.course_name}</span>}
                <span>{formatBytes(upload.size)}</span>
                <span>{upload.download_count} downloads</span>
            </div>
            <div className={styles.itemFooter}>
                <StatusBadge status={upload.status}/>
                {upload.reviewed_at && <span>Reviewed {formatRelativeTime(new Date(upload.reviewed_at))}</span>}
            </div>
        </Link>
    );
}

function StatusBadge({status}: { status: string }) {
    return <span className={`${styles.statusBadge} ${styles[status]}`}>{status}</span>;
}

function StatusPanel({icon, text}: { icon: ReactNode; text: string }) {
    return (
        <div className={styles.statusPanel}>
            <span className={styles.panelIcon}>{icon}</span>
            <span>{text}</span>
        </div>
    );
}

function trimText(value: string, fallback = "No text.") {
    const text = value.trim();
    if (!text) return fallback;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function UserIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path fill="currentColor"
                  d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.02-8 4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5C20 16.02 16.42 14 12 14Z"/>
        </svg>
    );
}
