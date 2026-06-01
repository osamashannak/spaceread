import {type KeyboardEvent, useCallback, useEffect, useMemo, useState} from "react";
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    FileImage,
    Film,
    LoaderCircle,
    RefreshCw,
    StickyNote,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    AdminApiError,
    type AdminReview,
    listAdminReviews,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./moderation.module.scss";

type LoadState = "loading" | "ready" | "error";
type Tone = "default" | "warning" | "danger" | "info" | "success";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

export function ModerationPage() {
    const [reviews, setReviews] = useState<AdminReview[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const {openEntity} = useAdminEntityDrawer();

    const loadReviews = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        listAdminReviews(controller.signal)
            .then(response => {
                setReviews(response.reviews.filter(belongsInReviewQueue));
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                if (err instanceof AdminApiError) {
                    setError(err.message);
                    return;
                }
                setError("Could not load reviews.");
            })
            .finally(() => setIsRefreshing(false));

        return () => controller.abort();
    }, []);

    useEffect(() => loadReviews("initial"), [loadReviews]);

    useEffect(() => {
        function onReviewUpdated(event: Event) {
            const review = (event as CustomEvent<AdminReview>).detail;
            setReviews(current => {
                const next = current.filter(item => item.id !== review.id);
                if (belongsInReviewQueue(review)) {
                    next.push(review);
                }
                return next;
            });
        }

        window.addEventListener("admin-review-updated", onReviewUpdated);
        return () => window.removeEventListener("admin-review-updated", onReviewUpdated);
    }, []);

    const orderedReviews = useMemo(() => (
        [...reviews].sort((a, b) => priorityScore(b) - priorityScore(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    ), [reviews]);

    function openReview(review: AdminReview) {
        setSelectedId(review.id);
        openEntity({type: "review", id: review.id});
    }

    return (
        <div className={styles.page}>
            <div className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Reviews</p>
                    <h1 className={styles.title}>Review moderation</h1>
                </div>
                <div className={styles.introActions}>
                    {isRefreshing && <span className={cn(styles.previewNote, styles.refreshingNote)}>Refreshing</span>}
                    <Button className={styles.refreshButton} disabled={isRefreshing} type="button" variant="outline" onClick={() => loadReviews("refresh")}>
                        {isRefreshing ? <LoaderCircle className={styles.spin} size={16}/> : <RefreshCw size={16}/>}
                        Refresh
                    </Button>
                </div>
            </div>

            <section className={cn(styles.reviewFeed, isRefreshing && styles.refreshingFeed)}>
                {loadState === "loading" && reviews.length === 0 && <SkeletonList/>}
                {loadState === "error" && reviews.length === 0 && (
                    <div className={cn(styles.stateNotice, styles.errorNotice)}>
                        <AlertCircle size={20}/>
                        <div>
                            <strong>Reviews could not be loaded</strong>
                            <span>{error || "The admin service did not return a usable response."}</span>
                        </div>
                        <Button type="button" variant="outline" onClick={() => loadReviews("initial")}>
                            <RefreshCw size={16}/>
                            Refresh
                        </Button>
                    </div>
                )}
                {loadState === "ready" && orderedReviews.length === 0 && (
                    <div className={styles.stateNotice}>
                        <CheckCircle2 size={20}/>
                        <div>
                            <strong>No reviews need attention</strong>
                            <span>New reports or unreviewed reviews will appear here.</span>
                        </div>
                    </div>
                )}
                {orderedReviews.length > 0 && (
                    <div className={styles.queue}>
                        {orderedReviews.map(review => (
                            <ReviewQueueItem
                                key={review.id}
                                review={review}
                                selected={review.id === selectedId}
                                onOpen={() => openReview(review)}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function ReviewQueueItem({review, selected, onOpen}: { review: AdminReview; selected: boolean; onOpen: () => void }) {
    const status = reviewStatus(review);
    const openReportCount = openReports(review).length;
    const hasMedia = Boolean(review.attachment || review.gif);

    function onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
        }
    }

    return (
        <article
            aria-label={`Open review ${review.id}`}
            className={cn(styles.reviewRow, selected && styles.selected)}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={onKeyDown}
        >
            <div className={styles.queueReview}>
                <div className={styles.queueMain}>
                    <div className={styles.queueHeader}>
                        <strong>{review.professor_name}</strong>
                        <span><EntityLink target={{type: "review", id: review.id}}>#{review.id}</EntityLink></span>
                        <span>{formatDateTime(review.created_at)}</span>
                    </div>
                    <div className={styles.queueState}>
                        <Badge
                            aria-label={status.label}
                            className={cn(styles.compactBadge, styles.iconBadge)}
                            title={status.label}
                            variant={status.tone}
                        >
                            {review.visible && !review.deleted_at ? <Eye size={13}/> : <EyeOff size={13}/>}
                        </Badge>
                        <Badge
                            aria-label={review.reviewed ? "Reviewed" : "Not reviewed"}
                            className={cn(styles.compactBadge, styles.iconBadge)}
                            title={review.reviewed ? "Reviewed" : "Not reviewed"}
                            variant={review.reviewed ? "success" : "warning"}
                        >
                            {review.reviewed ? <CheckCircle2 size={13}/> : <StickyNote size={13}/>}
                        </Badge>
                        <Badge className={styles.compactBadge} title={`Rating ${review.score} out of 5`} variant={ratingTone(review.score)}>
                            {review.score}/5
                        </Badge>
                        <Badge className={cn(styles.compactBadge, styles.iconBadge)} title={review.positive ? "Recommended" : "Not recommended"} variant={review.positive ? "success" : "danger"}>
                            {review.positive ? <ThumbsUp size={13}/> : <ThumbsDown size={13}/>}
                        </Badge>
                        {hasMedia && (
                            <Badge className={cn(styles.compactBadge, styles.iconBadge)} title={review.attachment ? "Attachment" : "GIF"} variant="warning">
                                {review.attachment ? <FileImage size={13}/> : <Film size={13}/>}
                            </Badge>
                        )}
                        {openReportCount > 0 && <Badge className={styles.compactBadge} variant="warning">{openReportCount} reports</Badge>}
                        {review.signals.length > 0 && <Badge className={styles.compactBadge} variant="danger">{review.signals.length} signals</Badge>}
                    </div>
                    <p className={styles.queueText}>{review.text}</p>
                    <div className={styles.queueMeta}>
                        <span>{review.student_verified ? "UAEU Student" : "User"}</span>
                        {review.course_taken && <span>{review.course_taken}</span>}
                        {review.grade_received && <span>{review.grade_received}</span>}
                        <span>{review.like_count} likes</span>
                        <span>{review.dislike_count} dislikes</span>
                        <span>{review.reply_count} replies</span>
                    </div>
                </div>
            </div>
        </article>
    );
}

function SkeletonList() {
    return (
        <div className={styles.queue}>
            {Array.from({length: 5}).map((_, index) => (
                <div className={styles.skeletonRow} key={index}>
                    <span/>
                    <span/>
                    <span/>
                </div>
            ))}
        </div>
    );
}

function openReports(review: AdminReview) {
    return review.reports.filter(report => !report.resolved);
}

function reviewStatus(review: AdminReview): { label: string; tone: Tone } {
    if (review.deleted_at) return {label: "Deleted", tone: "default"};
    if (review.visible) return {label: "Visible to users", tone: "success"};
    if (!review.reviewed) return {label: "Hidden from users", tone: "warning"};
    return {label: "Hidden from users", tone: "danger"};
}

function priorityScore(review: AdminReview) {
    return openReports(review).length * 10 + review.signals.length * 6 + (!review.visible && !review.reviewed ? 3 : 0);
}

function belongsInReviewQueue(review: AdminReview) {
    if (review.deleted_at) return false;
    if (!review.visible && review.reviewed) return false;
    return !review.reviewed || openReports(review).length > 0;
}

function ratingTone(score: number): Tone {
    if (score >= 4) return "success";
    if (score <= 2) return "danger";
    return "warning";
}

function formatDateTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
}
