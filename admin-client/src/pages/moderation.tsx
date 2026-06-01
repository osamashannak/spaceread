import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Eye,
    EyeOff,
    FileImage,
    Film,
    LoaderCircle,
    RefreshCw,
    StickyNote,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {adminLoginUrl} from "@/lib/admin_auth";
import {
    AdminApiError,
    type AdminDecisionResponse,
    type AdminReason,
    type AdminReview,
    listAdminReasons,
    listAdminReviews,
    saveReviewNote,
    setReviewAttachmentVisibility,
    setReviewVisibility,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./moderation.module.scss";

type Tone = "default" | "warning" | "danger" | "info" | "success";
type RatingValue = "like" | "dislike";
type LoadState = "loading" | "ready" | "error";

type ReasonOption = {
    code: string;
    label: string;
};

type ReviewReport = {
    id: string;
    reason: string;
    createdAt: string;
    sessionId: string;
    userId?: string;
    resolved: boolean;
    resolutionAction?: string;
    resolvedAt?: string;
    resolverUserId?: string;
    resolutionReasonCode?: string;
    resolutionNote?: string;
};

type ReviewSignal = {
    id?: string;
    engine: string;
    attribute: string;
    createdAt: string;
    score?: number;
    threshold?: number;
    severity?: string;
};

type ReviewRating = {
    value: RatingValue;
    createdAt: string;
    sessionId: string;
    userId?: string;
    ipAddress: string;
};

type ReviewReply = {
    id: string;
    authorName: string;
    content: string;
    createdAt: string;
    visible: boolean;
    sessionId: string;
    userId?: string;
    mention?: string;
    op: boolean;
    likeCount: number;
    deletedAt?: string;
    gif?: string;
};

type ReviewAttachment = {
    id: string;
    url: string;
    blobName: string;
    mimeType: string;
    size: number;
    width: number;
    height: number;
    visible: boolean;
    createdAt: string;
    ipAddress?: string;
};

type ReviewGif = {
    url: string;
};

type ReviewMedia =
    | ({kind: "attachment"} & ReviewAttachment)
    | ({kind: "gif"} & ReviewGif);

type ReviewRecord = {
    id: string;
    professorName: string;
    professorEmail: string;
    author: string;
    createdAt: string;
    score: number;
    positive: boolean;
    content: string;
    courseTaken?: string;
    gradeReceived?: string;
    language: string;
    visible: boolean;
    reviewed: boolean;
    deletedAt?: string;
    uaeuOrigin: boolean;
    studentVerified: boolean;
    likeCount: number;
    dislikeCount: number;
    replyCount: number;
    media?: ReviewMedia;
    sessionId?: string;
    userId?: string;
    ipAddress?: string;
    ratings: ReviewRating[];
    replies: ReviewReply[];
    reports: ReviewReport[];
    signals: ReviewSignal[];
    lastAction?: string;
    moderationReason?: string;
    moderationNote?: string;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function openReports(review: ReviewRecord) {
    return review.reports.filter(report => !report.resolved);
}

function reviewStatus(review: ReviewRecord): { label: string; tone: Tone } {
    if (review.deletedAt) return {label: "Deleted", tone: "default"};
    if (review.visible) return {label: "Public", tone: "success"};
    if (!review.reviewed) return {label: "Not public", tone: "warning"};
    return {label: "Hidden", tone: "danger"};
}

function priorityScore(review: ReviewRecord) {
    return openReports(review).length * 10 + review.signals.length * 6 + (!review.visible && !review.reviewed ? 3 : 0);
}

function visibilityText(review: ReviewRecord) {
    if (review.deletedAt) return "Deleted by user";
    return review.visible ? "Visible to users" : "Hidden from users";
}

function sourceText(review: ReviewRecord) {
    return review.uaeuOrigin ? "UAEU network" : "External network";
}

function publicReviewUrl(review: ReviewRecord) {
    const publicClientOrigin = stripTrailingSlash(import.meta.env.VITE_PUBLIC_SITE_URL || "https://spaceread.net");
    return `${publicClientOrigin}/professor/${encodeURIComponent(review.professorEmail)}#review-${review.id}`;
}

function mediaTypeLabel(mimeType: string) {
    if (mimeType === "image/png") return "PNG image";
    if (mimeType === "image/jpeg") return "JPEG image";
    if (mimeType === "image/gif") return "GIF image";
    return mimeType;
}

function maskIpAddress(value: string | undefined, visible: boolean) {
    if (!value) return "";
    if (visible) return value;

    const parts = value.split(".");
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }

    return value.replace(/[A-Fa-f0-9]/g, "x");
}

function replyStatus(reply: ReviewReply): { label: string; tone: Tone } {
    if (reply.deletedAt) return {label: "Deleted", tone: "default"};
    return reply.visible ? {label: "Visible", tone: "success"} : {label: "Hidden", tone: "danger"};
}

function defaultRatingView(review?: ReviewRecord): RatingValue {
    return review && review.likeCount > 0 ? "like" : "dislike";
}

function actionLabel(value: string) {
    const text = value.replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function reportState(report: ReviewReport): { label: string; tone: Tone } {
    return report.resolved ? {label: "Closed", tone: "success"} : {label: "Open", tone: "warning"};
}

function ratingTone(score: number): Tone {
    if (score >= 4) return "success";
    if (score <= 2) return "danger";
    return "warning";
}

function countLabel(count: number, singular: string) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDateTime(value?: string) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
}

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatScore(value?: number) {
    if (value === undefined) return "";
    return value.toFixed(value >= 10 ? 0 : 2).replace(/\.?0+$/, "");
}

function reasonFallback(reasons: ReasonOption[]) {
    return reasons[0]?.code || "";
}

function normalizeReasons(reasons: AdminReason[]): ReasonOption[] {
    return reasons
        .filter(reason => reason.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
        .map(reason => ({code: reason.code, label: reason.label}));
}

function normalizeReview(review: AdminReview): ReviewRecord {
    const media = review.attachment ? {
        kind: "attachment" as const,
        id: review.attachment.id,
        url: review.attachment.url,
        blobName: review.attachment.blob_name,
        mimeType: review.attachment.mime_type,
        size: review.attachment.size,
        width: review.attachment.width,
        height: review.attachment.height,
        visible: review.attachment.visible,
        createdAt: formatDateTime(review.attachment.created_at),
        ipAddress: review.attachment.ip_address,
    } : review.gif ? {
        kind: "gif" as const,
        url: review.gif,
    } : undefined;

    return {
        id: review.id,
        professorName: review.professor_name,
        professorEmail: review.professor_email,
        author: review.student_verified ? "UAEU Student" : "User",
        createdAt: formatDateTime(review.created_at),
        score: review.score,
        positive: review.positive,
        content: review.text,
        courseTaken: review.course_taken,
        gradeReceived: review.grade_received,
        language: review.language,
        visible: review.visible,
        reviewed: review.reviewed,
        deletedAt: review.deleted_at ? formatDateTime(review.deleted_at) : undefined,
        uaeuOrigin: review.uaeu_origin,
        studentVerified: review.student_verified,
        likeCount: review.like_count,
        dislikeCount: review.dislike_count,
        replyCount: review.reply_count,
        media,
        sessionId: review.session_id,
        userId: review.user_id,
        ipAddress: review.ip_address,
        ratings: review.ratings.map(rating => ({
            value: rating.value,
            createdAt: formatDateTime(rating.created_at),
            sessionId: rating.session_id,
            userId: rating.user_id,
            ipAddress: rating.ip_address,
        })),
        replies: review.replies.map(reply => ({
            id: reply.id,
            authorName: reply.author || (reply.op ? "Original poster" : "User"),
            content: reply.text,
            createdAt: formatDateTime(reply.created_at),
            visible: reply.visible,
            sessionId: reply.session_id,
            userId: reply.user_id,
            mention: reply.mention,
            op: reply.op,
            likeCount: reply.like_count,
            deletedAt: reply.deleted_at ? formatDateTime(reply.deleted_at) : undefined,
            gif: reply.gif,
        })),
        reports: review.reports.map(report => ({
            id: report.id,
            reason: report.reason,
            createdAt: formatDateTime(report.created_at),
            sessionId: report.session_id,
            userId: report.user_id,
            resolved: report.resolved,
            resolutionAction: report.resolution_action,
            resolvedAt: report.resolved_at ? formatDateTime(report.resolved_at) : undefined,
            resolverUserId: report.resolver_user_id,
            resolutionReasonCode: report.resolution_reason_code,
            resolutionNote: report.resolution_note,
        })),
        signals: review.signals.map(signal => ({
            id: signal.id,
            engine: signal.source,
            attribute: signal.attribute,
            createdAt: formatDateTime(signal.created_at),
            score: signal.score,
            threshold: signal.threshold,
            severity: signal.severity,
        })),
        lastAction: review.action_history[0] ? actionLabel(review.action_history[0].action) : undefined,
        moderationReason: review.moderation_reason_code,
        moderationNote: review.moderation_note,
    };
}

function stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown) {
    if (error instanceof AdminApiError) {
        if (error.status === 401) return "Sign in with an admin account to view reviews.";
        if (error.status === 403) return "This account does not have admin access.";
        if (error.status >= 500) return "Admin API is unavailable.";
        return error.message;
    }

    if (error instanceof Error) return error.message;
    return "Something went wrong.";
}

function PublicReview({review}: { review: ReviewRecord }) {
    return (
        <article className={styles.reviewPreview}>
            <div className={styles.publicTop}>
                <strong>{review.author}</strong>
                <time>{review.createdAt}</time>
            </div>
            <div className={styles.reviewMeta}>
                <span className={styles.stars}>{review.score} out of 5</span>
                <span>{review.positive ? "Recommend" : "Not recommended"}</span>
                {review.courseTaken && <span>{review.courseTaken}</span>}
                {review.gradeReceived && <span>{review.gradeReceived}</span>}
                {review.studentVerified && <span>Verified student</span>}
            </div>
            <p>{review.content}</p>
            {review.media && (
                <div className={styles.previewMedia}>
                    <img
                        alt={review.media.kind === "attachment" ? `Attachment ${review.media.id}` : "GIF preview"}
                        src={review.media.url}
                    />
                </div>
            )}
            <div className={styles.publicFooter}>
                <span>{review.likeCount} likes</span>
                <span>{review.dislikeCount} dislikes</span>
                <span>{review.replyCount} replies</span>
                <span>{sourceText(review)}</span>
            </div>
        </article>
    );
}

export function ModerationPage() {
    const [reviews, setReviews] = useState<ReviewRecord[]>([]);
    const [reasons, setReasons] = useState<ReasonOption[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPanelClosing, setIsPanelClosing] = useState(false);
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [ratingView, setRatingView] = useState<RatingValue>("dislike");
    const [showSensitive, setShowSensitive] = useState(false);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const hasLoadedRef = useRef(false);
    const closeTimerRef = useRef<number | null>(null);

    const selected = reviews.find(review => review.id === selectedId) || null;
    const selectedOpenReports = selected ? openReports(selected) : [];
    const visibleRatings = selected ? selected.ratings.filter(rating => rating.value === ratingView) : [];

    const sortedReviews = useMemo(() => (
        [...reviews].sort((a, b) => priorityScore(b) - priorityScore(a))
    ), [reviews]);

    const loadData = useCallback(async (signal?: AbortSignal, mode: "initial" | "refresh" = "refresh") => {
        const backgroundRefresh = mode === "refresh" || hasLoadedRef.current;

        if (backgroundRefresh) {
            setIsRefreshing(true);
        } else {
            setLoadState("loading");
            setLoadError(null);
            setLoadErrorStatus(null);
        }

        try {
            const [reasonResponse, reviewResponse] = await Promise.all([
                listAdminReasons(signal),
                listAdminReviews(signal),
            ]);
            const nextReasons = normalizeReasons(reasonResponse.reasons);
            const nextReviews = reviewResponse.reviews.map(normalizeReview);

            setReasons(nextReasons);
            setReason(current => nextReasons.some(option => option.code === current) ? current : reasonFallback(nextReasons));
            setReviews(nextReviews);
            hasLoadedRef.current = true;
            setLoadError(null);
            setLoadErrorStatus(null);
            setLoadState("ready");
        } catch (error) {
            if (isAbortError(error)) return;
            const status = error instanceof AdminApiError ? error.status : null;
            setLoadError(errorMessage(error));
            setLoadErrorStatus(status);
            if (!hasLoadedRef.current || status === 401 || status === 403) {
                setLoadState("error");
            }
        } finally {
            if (!signal?.aborted) {
                setIsRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadData(controller.signal, "initial");
        return () => controller.abort();
    }, [loadData]);

    useEffect(() => {
        if (!selectedId) return;
        if (loadState === "ready" && !reviews.some(review => review.id === selectedId)) {
            setSelectedId(null);
        }
    }, [loadState, reviews, selectedId]);

    useEffect(() => {
        if (!reason && reasons.length > 0) {
            setReason(reasonFallback(reasons));
        }
    }, [reason, reasons]);

    function clearCloseTimer() {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }

    function closePanel() {
        if (!selectedId) return;

        clearCloseTimer();
        setIsPanelClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
            setSelectedId(null);
            setIsPanelClosing(false);
            closeTimerRef.current = null;
            setActionError(null);
            setActionMessage(null);
        }, 190);
    }

    useEffect(() => () => clearCloseTimer(), []);

    useEffect(() => {
        if (!selectedId) return;

        const originalOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closePanel();
            }
        };

        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [selectedId]);

    function selectReview(review: ReviewRecord) {
        clearCloseTimer();
        setIsPanelClosing(false);
        setSelectedId(review.id);
        setReason(review.moderationReason || reasonFallback(reasons));
        setNote(review.moderationNote || "");
        setRatingView(defaultRatingView(review));
        setActionError(null);
        setActionMessage(null);
    }

    function replaceReview(review: ReviewRecord) {
        setReviews(current => current.map(item => item.id === review.id ? review : item));
        setSelectedId(review.id);
        setNote(review.moderationNote || "");
        setReason(review.moderationReason || reasonFallback(reasons));
        setRatingView(current => review.ratings.some(rating => rating.value === current) ? current : defaultRatingView(review));
    }

    async function runAction(name: string, action: () => Promise<string>) {
        setPendingAction(name);
        setActionError(null);
        setActionMessage(null);

        try {
            const message = await action();
            setActionMessage(message);
        } catch (error) {
            setActionError(errorMessage(error));
        } finally {
            setPendingAction(null);
        }
    }

    function applyDecision(response: AdminDecisionResponse) {
        replaceReview(normalizeReview(response.review));
    }

    function hideReview() {
        if (!selected) return;
        if (!reason || reasons.length === 0) {
            setActionError("Choose a policy reason before hiding this review.");
            return;
        }

        void runAction("hide-review", async () => {
            const response = await setReviewVisibility(selected.id, {
                visible: false,
                reason_code: reason,
                note: note || undefined,
                resolve_reports: true,
            });
            applyDecision(response);
            return `Review hidden; ${countLabel(response.resolved_report_count, "report")} closed.`;
        });
    }

    function keepVisible() {
        if (!selected) return;

        void runAction("keep-review", async () => {
            const response = await setReviewVisibility(selected.id, {
                visible: true,
                note: note || undefined,
                resolve_reports: true,
            });
            applyDecision(response);
            return `Review kept public; ${countLabel(response.resolved_report_count, "report")} closed.`;
        });
    }

    function saveNote() {
        if (!selected) return;

        void runAction("save-note", async () => {
            const response = await saveReviewNote(selected.id, {note});
            applyDecision(response);
            return "Internal note saved.";
        });
    }

    function changeAttachmentVisibility(visible: boolean) {
        if (!selected || selected.media?.kind !== "attachment") return;
        const attachmentId = selected.media.id;

        void runAction(visible ? "show-attachment" : "hide-attachment", async () => {
            const response = await setReviewAttachmentVisibility(attachmentId, {
                visible,
                note: note || undefined,
            });
            applyDecision(response);
            return visible ? "Attachment shown." : "Attachment hidden.";
        });
    }

    const isBusy = pendingAction !== null;

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Reviews</p>
                    <h2 className={styles.title}>Review moderation</h2>
                </div>
                <div className={styles.introActions}>
                    <span className={cn(styles.previewNote, isRefreshing && styles.refreshingNote)}>
                        {isRefreshing ? "Refreshing" : loadState === "loading" ? "Loading" : loadState === "error" ? "Unavailable" : countLabel(reviews.length, "review")}
                    </span>
                    <Button className={styles.refreshButton} disabled={loadState === "loading" || isRefreshing} size="icon" type="button" variant="outline" onClick={() => void loadData()}>
                        <RefreshCw className={isRefreshing ? styles.spin : undefined} size={16}/>
                    </Button>
                </div>
            </section>

            <div className={styles.workspace}>
                <section aria-busy={loadState === "loading" || isRefreshing} aria-label="Reviews" className={cn(styles.reviewFeed, isRefreshing && styles.refreshingFeed)}>
                    <div className={styles.queue}>
                        {loadState === "loading" && (
                            <>
                                <ReviewSkeleton/>
                                <ReviewSkeleton/>
                                <ReviewSkeleton/>
                            </>
                        )}

                        {loadState === "error" && (
                            <div className={cn(styles.stateNotice, styles.errorNotice)}>
                                <AlertCircle size={17}/>
                                <div>
                                    <strong>{loadError}</strong>
                                    <span>Check the admin API, authentication, and network access.</span>
                                </div>
                                {(loadErrorStatus === 401 || loadErrorStatus === 403) && (
                                    <Button asChild size="sm" variant="outline">
                                        <a href={adminLoginUrl()}>Sign in</a>
                                    </Button>
                                )}
                            </div>
                        )}

                        {loadState === "ready" && sortedReviews.length === 0 && (
                            <div className={styles.stateNotice}>
                                <CheckCircle2 size={17}/>
                                <div>
                                    <strong>No reviews found.</strong>
                                    <span>Reviews will appear here when they exist in the database.</span>
                                </div>
                            </div>
                        )}

                        {loadState === "ready" && sortedReviews.map(review => {
                            const status = reviewStatus(review);
                            const reportCount = openReports(review).length;
                            const selectedRow = review.id === selected?.id;

                            return (
                                <button
                                    className={cn(styles.reviewRow, selectedRow && styles.selected)}
                                    key={review.id}
                                    type="button"
                                    onClick={() => selectReview(review)}
                                >
                                    <article className={styles.queueReview}>
                                        <div className={styles.queueMain}>
                                            <div className={styles.queueHeader}>
                                                <strong>{review.professorName}</strong>
                                                <span>#{review.id}</span>
                                                <span>{review.createdAt}</span>
                                            </div>
                                            <div className={styles.queueState}>
                                                <Badge
                                                    aria-label={visibilityText(review)}
                                                    className={cn(styles.compactBadge, styles.iconBadge)}
                                                    title={visibilityText(review)}
                                                    variant={status.tone}
                                                >
                                                    {review.visible && !review.deletedAt ? <Eye size={13}/> : <EyeOff size={13}/>}
                                                </Badge>
                                                <Badge
                                                    aria-label={review.reviewed ? "Reviewed" : "Not reviewed"}
                                                    className={cn(styles.compactBadge, styles.iconBadge)}
                                                    title={review.reviewed ? "Reviewed" : "Not reviewed"}
                                                    variant={review.reviewed ? "success" : "warning"}
                                                >
                                                    {review.reviewed ? <CheckCircle2 size={13}/> : <StickyNote size={13}/>}
                                                </Badge>
                                                <Badge className={styles.compactBadge} title={`Language: ${review.language}`} variant="outline">{review.language}</Badge>
                                                <Badge className={styles.compactBadge} title={`${review.score} out of 5`} variant={ratingTone(review.score)}>{review.score}/5</Badge>
                                                <Badge
                                                    aria-label={review.positive ? "Recommend" : "Not recommended"}
                                                    className={cn(styles.compactBadge, styles.iconBadge)}
                                                    title={review.positive ? "Recommend" : "Not recommended"}
                                                    variant={review.positive ? "success" : "danger"}
                                                >
                                                    {review.positive ? <ThumbsUp size={13}/> : <ThumbsDown size={13}/>}
                                                </Badge>
                                                {review.media && (
                                                    <Badge
                                                        aria-label={review.media.kind === "attachment" ? "Attachment" : "GIF"}
                                                        className={cn(styles.compactBadge, styles.iconBadge)}
                                                        title={review.media.kind === "attachment" ? "Attachment" : "GIF"}
                                                        variant="outline"
                                                    >
                                                        {review.media.kind === "attachment" ? <FileImage size={13}/> : <Film size={13}/>}
                                                    </Badge>
                                                )}
                                                {reportCount > 0 && <Badge className={styles.compactBadge} variant="warning">{countLabel(reportCount, "report")}</Badge>}
                                                {review.signals.length > 0 && <Badge className={styles.compactBadge} variant="danger">{countLabel(review.signals.length, "signal")}</Badge>}
                                            </div>
                                            <p className={styles.queueText}>{review.content}</p>
                                            <div className={styles.queueMeta}>
                                                <span>{review.author}</span>
                                                {review.courseTaken && <span>{review.courseTaken}</span>}
                                                {review.gradeReceived && <span>{review.gradeReceived}</span>}
                                                <span>{review.likeCount} likes</span>
                                                <span>{review.dislikeCount} dislikes</span>
                                                <span>{review.replyCount} replies</span>
                                            </div>
                                        </div>
                                    </article>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {selected && createPortal((
                    <div className={cn(styles.panelLayer, isPanelClosing && styles.panelClosing)}>
                        <button
                            aria-label="Close review panel"
                            className={styles.panelBackdrop}
                            type="button"
                            onClick={closePanel}
                        />
                        <aside aria-labelledby="review-panel-title" aria-modal="true" className={styles.sidePanel} role="dialog">
                            <div className={styles.panelHeader}>
                                <div className={styles.detailTitleRow}>
                                    <h3 className={styles.panelTitle} id="review-panel-title">Review {selected.id}</h3>
                                    <div className={styles.headerActions}>
                                        <Button asChild size="icon" variant="outline">
                                            <a aria-label="Open public review" href={publicReviewUrl(selected)} rel="noreferrer" target="_blank">
                                                <ExternalLink size={16}/>
                                            </a>
                                        </Button>
                                        <button
                                            aria-label={showSensitive ? "Hide sensitive data" : "Show sensitive data"}
                                            className={styles.iconButton}
                                            type="button"
                                            onClick={() => setShowSensitive(current => !current)}
                                        >
                                            {showSensitive ? <EyeOff size={16}/> : <Eye size={16}/>}
                                        </button>
                                        <button
                                            aria-label="Close review panel"
                                            className={styles.iconButton}
                                            type="button"
                                            onClick={closePanel}
                                        >
                                            <X size={16}/>
                                        </button>
                                    </div>
                                </div>
                                <p className={styles.panelSubtitle}>
                                    <span className={styles.descriptionLine}>
                                        <span>{selected.professorName}</span>
                                        <span>{selected.professorEmail}</span>
                                    </span>
                                </p>
                                <div className={styles.panelBadges}>
                                    <Badge
                                        aria-label={visibilityText(selected)}
                                        className={cn(styles.compactBadge, styles.iconBadge)}
                                        title={visibilityText(selected)}
                                        variant={reviewStatus(selected).tone}
                                    >
                                        {selected.visible && !selected.deletedAt ? <Eye size={13}/> : <EyeOff size={13}/>}
                                    </Badge>
                                    <Badge
                                        aria-label={selected.reviewed ? "Reviewed" : "Not reviewed"}
                                        className={cn(styles.compactBadge, styles.iconBadge)}
                                        title={selected.reviewed ? "Reviewed" : "Not reviewed"}
                                        variant={selected.reviewed ? "success" : "warning"}
                                    >
                                        {selected.reviewed ? <CheckCircle2 size={13}/> : <StickyNote size={13}/>}
                                    </Badge>
                                    <Badge className={styles.compactBadge} title={`Language: ${selected.language}`} variant="outline">{selected.language}</Badge>
                                </div>
                            </div>
                            <div className={styles.panelBody}>
                                <PublicReview review={selected}/>

                                <section className={styles.relatedPanel}>
                                    <div className={styles.boxHead}>
                                        <span>Author evidence</span>
                                    </div>
                                    <div className={styles.evidenceGrid}>
                                        {selected.sessionId && <Field label="Session ID" value={selected.sessionId}/>}
                                        {selected.userId && <Field label="User ID" value={selected.userId}/>}
                                        {selected.ipAddress && <Field label="IP address" value={maskIpAddress(selected.ipAddress, showSensitive)}/>}
                                    </div>
                                </section>

                                {selected.media && (
                                    <section className={styles.relatedPanel}>
                                        <div className={styles.boxHead}>
                                            <span>Media</span>
                                            {selected.media.kind === "attachment" && (
                                                <div className={styles.mediaActions}>
                                                    <Button disabled={selected.media.visible || isBusy} size="sm" type="button" onClick={() => changeAttachmentVisibility(true)}>
                                                        Show
                                                    </Button>
                                                    <Button disabled={!selected.media.visible || isBusy} size="sm" type="button" variant="outline" onClick={() => changeAttachmentVisibility(false)}>
                                                        Hide
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.mediaGrid}>
                                            {selected.media.kind === "attachment" && (
                                                <article className={styles.mediaItem}>
                                                    <div className={styles.mediaPreview}>
                                                        <img alt={`Attachment ${selected.media.id}`} src={selected.media.url}/>
                                                    </div>
                                                    <div className={styles.mediaBody}>
                                                        <div className={styles.mediaTitle}>
                                                            <FileImage size={15}/>
                                                            <strong>Attachment ID {selected.media.id}</strong>
                                                        </div>
                                                        <span>{mediaTypeLabel(selected.media.mimeType)}</span>
                                                        <span>{formatBytes(selected.media.size)}</span>
                                                        <span>{selected.media.width} x {selected.media.height}</span>
                                                        <span>{selected.media.visible ? "Visible" : "Hidden"}</span>
                                                        <span>Uploaded {selected.media.createdAt}</span>
                                                        {selected.media.ipAddress && <span>{maskIpAddress(selected.media.ipAddress, showSensitive)}</span>}
                                                    </div>
                                                </article>
                                            )}
                                            {selected.media.kind === "gif" && (
                                                <article className={styles.mediaItem}>
                                                    <div className={styles.mediaPreview}>
                                                        <img alt="GIF preview" src={selected.media.url}/>
                                                    </div>
                                                    <div className={styles.mediaBody}>
                                                        <div className={styles.mediaTitle}>
                                                            <Film size={15}/>
                                                            <strong>GIF</strong>
                                                        </div>
                                                        <span>{selected.media.url}</span>
                                                    </div>
                                                </article>
                                            )}
                                        </div>
                                    </section>
                                )}

                                <section className={styles.relatedPanel}>
                                    <div className={styles.boxHead}>
                                        <span>Likes and dislikes</span>
                                        <div className={styles.segmented}>
                                            <button
                                                aria-label="Show likes"
                                                className={cn(styles.segmentButton, ratingView === "like" && styles.segmentActive)}
                                                type="button"
                                                onClick={() => setRatingView("like")}
                                            >
                                                <ThumbsUp size={14}/>{selected.likeCount}
                                            </button>
                                            <button
                                                aria-label="Show dislikes"
                                                className={cn(styles.segmentButton, ratingView === "dislike" && styles.segmentActive)}
                                                type="button"
                                                onClick={() => setRatingView("dislike")}
                                            >
                                                <ThumbsDown size={14}/>{selected.dislikeCount}
                                            </button>
                                        </div>
                                    </div>
                                    <div className={styles.reportList}>
                                        {visibleRatings.length ? visibleRatings.map(rating => (
                                            <div className={styles.reportItem} key={`${rating.value}-${rating.sessionId}-${rating.createdAt}`}>
                                                <div>
                                                    <strong>Session ID {rating.sessionId}</strong>
                                                    <span>{rating.createdAt}</span>
                                                </div>
                                                <div className={styles.sideNote}>
                                                    <span>{rating.userId ? `User ID ${rating.userId}` : "Anonymous session"}</span>
                                                    <span>{maskIpAddress(rating.ipAddress, showSensitive)}</span>
                                                </div>
                                            </div>
                                        )) : <p className={styles.emptyLine}>No {ratingView === "like" ? "likes" : "dislikes"} recorded.</p>}
                                    </div>
                                </section>

                                {selected.replies.length > 0 && (
                                    <section className={styles.relatedPanel}>
                                        <div className={styles.boxHead}>
                                            <span>Replies</span>
                                            <Badge className={styles.compactBadge} variant="outline">{selected.replies.length}</Badge>
                                        </div>
                                        <div className={styles.reportList}>
                                            {selected.replies.map(reply => {
                                                const status = replyStatus(reply);

                                                return (
                                                    <article className={styles.replyItem} key={reply.id}>
                                                        <div className={styles.replyHead}>
                                                            <div>
                                                                <strong>{reply.authorName}</strong>
                                                                <span>Reply ID {reply.id}</span>
                                                                <span>{reply.createdAt}</span>
                                                            </div>
                                                            <div className={styles.replyBadges}>
                                                                <Badge className={styles.compactBadge} variant={status.tone}>{status.label}</Badge>
                                                                {reply.op && <Badge className={styles.compactBadge} variant="info">OP</Badge>}
                                                            </div>
                                                        </div>
                                                        <p>{reply.content}</p>
                                                        {reply.gif && <div className={styles.attachmentLine}>GIF attached</div>}
                                                        <div className={styles.replyMeta}>
                                                            <span>Session ID {reply.sessionId}</span>
                                                            {reply.userId && <span>User ID {reply.userId}</span>}
                                                            {reply.mention && <span>Mentions {reply.mention}</span>}
                                                            <span>{reply.likeCount} likes</span>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {selected.reports.length > 0 && (
                                    <section className={styles.relatedPanel}>
                                        <div className={styles.boxHead}>
                                            <span>Reports</span>
                                            <Badge className={styles.compactBadge} variant={selectedOpenReports.length ? "warning" : "success"}>
                                                {selectedOpenReports.length ? `${selectedOpenReports.length} open` : `${selected.reports.length} closed`}
                                            </Badge>
                                        </div>
                                        <div className={styles.reportList}>
                                            {selected.reports.map(report => {
                                                const state = reportState(report);

                                                return (
                                                    <article className={styles.reportEvidence} key={report.id}>
                                                        <div className={styles.reportSummary}>
                                                            <div>
                                                                <strong>{report.reason}</strong>
                                                                <span>ID {report.id}</span>
                                                            </div>
                                                            <Badge className={styles.compactBadge} variant={state.tone}>{state.label}</Badge>
                                                        </div>
                                                        <div className={styles.reportDetails}>
                                                            <Field label="Reporter session" value={report.sessionId}/>
                                                            {report.userId && <Field label="Reporter user" value={report.userId}/>}
                                                            <Field label="Submitted" value={report.createdAt}/>
                                                            {report.resolutionAction && <Field label="Resolution" value={actionLabel(report.resolutionAction)}/>}
                                                            {report.resolvedAt && <Field label="Resolved at" value={report.resolvedAt}/>}
                                                            {report.resolverUserId && <Field label="Resolver user" value={report.resolverUserId}/>}
                                                            {report.resolutionReasonCode && <Field label="Policy" value={actionLabel(report.resolutionReasonCode)}/>}
                                                            {report.resolutionNote && <Field label="Note" value={report.resolutionNote}/>}
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {selected.signals.length > 0 && (
                                    <section className={styles.relatedPanel}>
                                        <div className={styles.boxHead}>
                                            <span>Moderation signals</span>
                                            <Badge className={styles.compactBadge} variant="danger">{selected.signals.length}</Badge>
                                        </div>
                                        <div className={styles.reportList}>
                                            {selected.signals.map(signal => (
                                                <div className={styles.reportItem} key={signal.id || `${signal.engine}-${signal.attribute}-${signal.createdAt}`}>
                                                    <div>
                                                        <strong>{signal.attribute}</strong>
                                                        <span>{signal.engine}</span>
                                                        <span>{signal.createdAt}</span>
                                                        {signal.severity && <span>{actionLabel(signal.severity)}</span>}
                                                        {signal.score !== undefined && <span>Score {formatScore(signal.score)}</span>}
                                                        {signal.threshold !== undefined && <span>Threshold {formatScore(signal.threshold)}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className={styles.reasonBox}>
                                    <span className={styles.label}>Policy reason if hidden</span>
                                    {reasons.length > 0 ? (
                                        <div className={styles.reasonOptions}>
                                            {reasons.map(option => (
                                                <button
                                                    className={cn(styles.reasonButton, option.code === reason && styles.reasonSelected)}
                                                    key={option.code}
                                                    type="button"
                                                    onClick={() => setReason(option.code)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className={styles.emptyLine}>Reason codes are unavailable.</p>
                                    )}
                                </section>

                                <div className={styles.decision}>
                                    <p className={styles.decisionHint}>
                                        Hiding or keeping a review closes {selectedOpenReports.length} open reports tied to it.
                                    </p>
                                    <Textarea disabled={isBusy} placeholder="Internal note" value={note} onChange={event => setNote(event.target.value)}/>
                                    <div className={styles.buttonRow}>
                                        <Button disabled={isBusy} type="button" variant="outline" onClick={keepVisible}>
                                            {pendingAction === "keep-review" ? <LoaderCircle className={styles.spin} size={16}/> : <CheckCircle2 size={16}/>}
                                            Keep public
                                        </Button>
                                        <Button disabled={isBusy || !reason || reasons.length === 0} type="button" variant="destructive" onClick={hideReview}>
                                            {pendingAction === "hide-review" ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                                            Hide review
                                        </Button>
                                        <Button disabled={isBusy} type="button" variant="outline" onClick={saveNote}>
                                            {pendingAction === "save-note" ? <LoaderCircle className={styles.spin} size={16}/> : <StickyNote size={16}/>}
                                            Save note
                                        </Button>
                                    </div>
                                    {actionError && <p className={styles.actionError}>{actionError}</p>}
                                    {actionMessage && <p className={styles.actionMessage}>{actionMessage}</p>}
                                    {selected.lastAction && <p className={styles.lastAction}>Last action: {selected.lastAction}</p>}
                                </div>
                            </div>
                        </aside>
                    </div>
                ), document.body)}
            </div>
        </div>
    );
}

function ReviewSkeleton() {
    return (
        <div className={styles.skeletonRow}>
            <span/>
            <span/>
            <span/>
        </div>
    );
}

function Field({label, value}: { label: string; value: string }) {
    return (
        <div className={styles.field}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
