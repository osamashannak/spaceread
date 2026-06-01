import {
    createContext,
    type MouseEvent,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {createPortal} from "react-dom";
import {
    ArrowLeft,
    CheckCircle2,
    ExternalLink,
    Eye,
    EyeOff,
    FileImage,
    LoaderCircle,
    MessageSquareText,
    RefreshCw,
    ShieldCheck,
    StickyNote,
    ThumbsDown,
    ThumbsUp,
    UserRound,
    Wifi,
    X,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
    type AdminCourseFileSummary,
    type AdminEntityActivity,
    type AdminEntitySession,
    type AdminEntityStats,
    type AdminIPDetailResponse,
    type AdminLoginSession,
    type AdminModerationAction,
    type AdminModerationSignal,
    type AdminProfessorRequestSummary,
    type AdminReason,
    type AdminReplyDecisionResponse,
    type AdminReplyLike,
    type AdminReview,
    type AdminReviewAttachmentSummary,
    type AdminReviewRating,
    type AdminReviewRatingSummary,
    type AdminReviewReply,
    type AdminReviewReplyResponse,
    type AdminReviewReplySummary,
    type AdminReviewReport,
    type AdminReviewReportSummary,
    type AdminReviewSummary,
    type AdminSessionDetailResponse,
    type AdminUserDetailResponse,
    getAdminIPDetail,
    getAdminReview,
    getAdminReviewReply,
    getAdminSessionDetail,
    getAdminUserDetail,
    listAdminReasons,
    markReviewReplyReviewed,
    saveReviewNote,
    saveReviewReplyNote,
    setReviewAttachmentVisibility,
    setReviewReplyVisibility,
    setReviewVisibility,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./entity_drawer.module.scss";

export type AdminEntityTarget =
    | { type: "review"; id: string }
    | { type: "reply"; id: string }
    | { type: "session"; id: string }
    | { type: "user"; id: string }
    | { type: "ip"; id: string };

type LoadedEntity =
    | { type: "review"; review: AdminReview }
    | { type: "reply"; detail: AdminReviewReplyResponse }
    | { type: "session"; detail: AdminSessionDetailResponse }
    | { type: "user"; detail: AdminUserDetailResponse }
    | { type: "ip"; detail: AdminIPDetailResponse };

type DrawerContextValue = {
    openEntity: (target: AdminEntityTarget) => void;
    closeDrawer: () => void;
    showSensitive: boolean;
    toggleSensitive: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);
const drawerCloseMs = 180;
const publicClientOrigin = stripTrailingSlash(import.meta.env.VITE_PUBLIC_SITE_URL || "https://spaceread.net");

export function AdminEntityDrawerProvider({children}: { children: ReactNode }) {
    const [current, setCurrent] = useState<{ target: AdminEntityTarget; entity?: LoadedEntity } | null>(null);
    const [pending, setPending] = useState<AdminEntityTarget | null>(null);
    const [backStack, setBackStack] = useState<AdminEntityTarget[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [showSensitive, setShowSensitive] = useState(false);
    const [reasons, setReasons] = useState<AdminReason[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        listAdminReasons(controller.signal)
            .then(response => setReasons(response.reasons))
            .catch(() => setReasons([]));
        return () => controller.abort();
    }, []);

    const closeDrawer = useCallback(() => {
        if (!current && !pending) return;
        setIsClosing(true);
        window.setTimeout(() => {
            setCurrent(null);
            setPending(null);
            setBackStack([]);
            setError(null);
            setIsClosing(false);
        }, drawerCloseMs);
    }, [current, pending]);

    const openEntity = useCallback((target: AdminEntityTarget) => {
        setIsClosing(false);
        setError(null);
        setCurrent(existing => {
            if (existing && targetKey(existing.target) === targetKey(target)) {
                setPending(target);
                return existing;
            }
            if (existing) {
                setBackStack(stack => [...stack, existing.target]);
                setPending(target);
                return existing;
            }
            setPending(target);
            return {target};
        });
    }, []);

    const goBack = useCallback(() => {
        setBackStack(stack => {
            const previous = stack[stack.length - 1];
            if (!previous) return stack;
            setPending(previous);
            return stack.slice(0, -1);
        });
    }, []);

    const reload = useCallback(() => {
        const target = pending || current?.target;
        if (target) {
            setPending(target);
        }
    }, [current?.target, pending]);

    useEffect(() => {
        if (!pending) return;

        const controller = new AbortController();
        const target = pending;
        setError(null);

        loadEntity(target, controller.signal)
            .then(entity => {
                setCurrent({target, entity});
                setPending(null);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : "Could not load entity");
                setPending(null);
            });

        return () => controller.abort();
    }, [pending]);

    useEffect(() => {
        if (!current && !pending) return;

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                closeDrawer();
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closeDrawer, current, pending]);

    const value = useMemo<DrawerContextValue>(() => ({
        openEntity,
        closeDrawer,
        showSensitive,
        toggleSensitive: () => setShowSensitive(value => !value),
    }), [closeDrawer, openEntity, showSensitive]);

    return (
        <DrawerContext.Provider value={value}>
            {children}
            {(current || pending) && createPortal((
                <div className={cn(styles.layer, isClosing && styles.closing)}>
                    <button aria-label="Close drawer" className={styles.backdrop} type="button" onClick={closeDrawer}/>
                    <aside aria-label="Entity details" aria-modal="true" className={styles.drawer} role="dialog">
                        <DrawerHeader
                            current={current}
                            pending={pending}
                            canGoBack={backStack.length > 0}
                            showSensitive={showSensitive}
                            onBack={goBack}
                            onClose={closeDrawer}
                            onRefresh={reload}
                            onToggleSensitive={() => setShowSensitive(value => !value)}
                        />
                        <div className={styles.body}>
                            {current?.entity ? (
                                <EntityContent
                                    entity={current.entity}
                                    error={error}
                                    isSwitching={Boolean(pending)}
                                    reasons={reasons}
                                    showSensitive={showSensitive}
                                    onReload={reload}
                                />
                            ) : (
                                <DrawerLoading error={error} onRetry={reload}/>
                            )}
                        </div>
                    </aside>
                </div>
            ), document.body)}
        </DrawerContext.Provider>
    );
}

export function useAdminEntityDrawer() {
    const value = useContext(DrawerContext);
    if (!value) {
        throw new Error("useAdminEntityDrawer must be used inside AdminEntityDrawerProvider");
    }
    return value;
}

export function EntityLink({
    target,
    children,
    className,
}: {
    target: AdminEntityTarget;
    children: ReactNode;
    className?: string;
}) {
    const {openEntity} = useAdminEntityDrawer();

    function onClick(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        openEntity(target);
    }

    return (
        <button className={cn(styles.entityLink, className)} type="button" onClick={onClick}>
            {children}
        </button>
    );
}

function DrawerHeader({
    current,
    pending,
    canGoBack,
    showSensitive,
    onBack,
    onClose,
    onRefresh,
    onToggleSensitive,
}: {
    current: { target: AdminEntityTarget; entity?: LoadedEntity } | null;
    pending: AdminEntityTarget | null;
    canGoBack: boolean;
    showSensitive: boolean;
    onBack: () => void;
    onClose: () => void;
    onRefresh: () => void;
    onToggleSensitive: () => void;
}) {
    const displayTarget = pending || current?.target;
    const title = displayTarget ? targetTitle(displayTarget) : "Details";
    const subtitle = current?.entity ? entitySubtitle(current.entity, showSensitive) : "Loading";
    const review = current?.entity?.type === "review" ? current.entity.review : undefined;

    return (
        <header className={styles.header}>
            <div className={styles.titleRow}>
                <div className={styles.titleWrap}>
                    <div className={styles.navActions}>
                        {canGoBack && (
                            <button aria-label="Back" className={styles.iconButton} type="button" onClick={onBack}>
                                <ArrowLeft size={16}/>
                            </button>
                        )}
                        <h3>{title}</h3>
                    </div>
                    <p>{subtitle}</p>
                </div>
                <div className={styles.actions}>
                    {review && (
                        <Button asChild size="icon" variant="outline">
                            <a aria-label="Open public review" href={publicReviewUrl(review)} rel="noreferrer" target="_blank">
                                <ExternalLink size={16}/>
                            </a>
                        </Button>
                    )}
                    <button aria-label="Refresh drawer" className={styles.iconButton} type="button" onClick={onRefresh}>
                        <RefreshCw size={16}/>
                    </button>
                    <button
                        aria-label={showSensitive ? "Hide sensitive data" : "Show sensitive data"}
                        className={styles.iconButton}
                        type="button"
                        onClick={onToggleSensitive}
                    >
                        {showSensitive ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                    <button aria-label="Close drawer" className={styles.iconButton} type="button" onClick={onClose}>
                        <X size={16}/>
                    </button>
                </div>
            </div>
        </header>
    );
}

function EntityContent({
    entity,
    error,
    isSwitching,
    reasons,
    showSensitive,
    onReload,
}: {
    entity: LoadedEntity;
    error: string | null;
    isSwitching: boolean;
    reasons: AdminReason[];
    showSensitive: boolean;
    onReload: () => void;
}) {
    return (
        <div className={cn(styles.content, isSwitching && styles.switching)}>
            {error && <p className={styles.errorLine}>{error}</p>}
            {entity.type === "review" && (
                <ReviewDrawer review={entity.review} reasons={reasons} showSensitive={showSensitive} onReload={onReload}/>
            )}
            {entity.type === "reply" && (
                <ReplyDrawer detail={entity.detail} reasons={reasons} showSensitive={showSensitive} onReload={onReload}/>
            )}
            {entity.type === "session" && (
                <SessionDrawer detail={entity.detail} showSensitive={showSensitive}/>
            )}
            {entity.type === "user" && (
                <UserDrawer detail={entity.detail} showSensitive={showSensitive}/>
            )}
            {entity.type === "ip" && (
                <IPDrawer detail={entity.detail} showSensitive={showSensitive}/>
            )}
            {isSwitching && (
                <div className={styles.switchLayer}>
                    <LoaderCircle className={styles.spin} size={18}/>
                </div>
            )}
        </div>
    );
}

function ReviewDrawer({
    review,
    reasons,
    showSensitive,
    onReload,
}: {
    review: AdminReview;
    reasons: AdminReason[];
    showSensitive: boolean;
    onReload: () => void;
}) {
    const [reason, setReason] = useState(review.moderation_reason_code || reasons[0]?.code || "");
    const [note, setNote] = useState(review.moderation_note || "");
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const openReports = review.reports.filter(report => !report.resolved);

    useEffect(() => {
        setReason(review.moderation_reason_code || reasons[0]?.code || "");
        setNote(review.moderation_note || "");
    }, [reasons, review.id, review.moderation_note, review.moderation_reason_code]);

    async function runAction(action: string, callback: () => Promise<{ review: AdminReview; message: string }>) {
        setPendingAction(action);
        setError("");
        setMessage("");
        try {
            const result = await callback();
            emitReviewUpdated(result.review);
            setMessage(result.message);
            onReload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setPendingAction(null);
        }
    }

    const media = reviewMedia(review);

    return (
        <>
            <PublicReviewPreview review={review}/>
            <DrawerSection title="Evidence">
                <FieldGrid>
                    {review.session_id && <Field label="Session" value={<EntityLink target={{type: "session", id: review.session_id}}>{review.session_id}</EntityLink>}/>}
                    {review.user_id && <Field label="User" value={<EntityLink target={{type: "user", id: review.user_id}}>{review.user_id}</EntityLink>}/>}
                    {review.ip_address && (
                        <Field
                            label="IP address"
                            value={<EntityLink target={{type: "ip", id: review.ip_address}}>{maskIpAddress(review.ip_address, showSensitive)}</EntityLink>}
                        />
                    )}
                    <Field label="Professor" value={review.professor_name}/>
                    <Field label="Professor email" value={review.professor_email}/>
                    <Field label="Created" value={formatDateTime(review.created_at)}/>
                </FieldGrid>
            </DrawerSection>

            {media && (
                <DrawerSection
                    title="Media"
                    action={media.kind === "attachment" && (
                        <div className={styles.inlineActions}>
                            <Button disabled={media.visible || Boolean(pendingAction)} size="sm" type="button" onClick={() => {
                                void runAction("show-attachment", async () => {
                                    const response = await setReviewAttachmentVisibility(media.id, {visible: true, reason_code: reason || undefined, note: note || undefined});
                                    return {review: response.review, message: "Attachment shown."};
                                });
                            }}>
                                Show
                            </Button>
                            <Button disabled={!media.visible || Boolean(pendingAction)} size="sm" type="button" variant="outline" onClick={() => {
                                void runAction("hide-attachment", async () => {
                                    const response = await setReviewAttachmentVisibility(media.id, {visible: false, reason_code: reason || undefined, note: note || undefined});
                                    return {review: response.review, message: "Attachment hidden."};
                                });
                            }}>
                                Hide
                            </Button>
                        </div>
                    )}
                >
                    <MediaBlock media={media} showSensitive={showSensitive}/>
                </DrawerSection>
            )}

            <RatingsSection ratings={review.ratings} likeCount={review.like_count} dislikeCount={review.dislike_count} showSensitive={showSensitive}/>
            <RepliesSection replies={review.replies} showSensitive={showSensitive}/>
            <ReportsSection reports={review.reports}/>
            <SignalsSection signals={review.signals}/>
            <ActionsSection actions={review.action_history}/>

            <DecisionBox
                disabled={!reasons.length || Boolean(pendingAction)}
                error={error}
                message={message}
                note={note}
                reason={reason}
                reasons={reasons}
                onNoteChange={setNote}
                onReasonChange={setReason}
            >
                <p className={styles.hint}>Keeping or hiding this review closes {openReports.length} open reports tied to it.</p>
                <div className={styles.buttonRow}>
                    <Button disabled={Boolean(pendingAction)} type="button" variant="outline" onClick={() => {
                        void runAction("keep-review", async () => {
                            const response = await setReviewVisibility(review.id, {visible: true, reason_code: reason || undefined, note: note || undefined, resolve_reports: true});
                            return {review: response.review, message: "Review kept public."};
                        });
                    }}>
                        {pendingAction === "keep-review" ? <LoaderCircle className={styles.spin} size={16}/> : <CheckCircle2 size={16}/>}
                        Keep public
                    </Button>
                    <Button disabled={!reason || Boolean(pendingAction)} type="button" variant="destructive" onClick={() => {
                        void runAction("hide-review", async () => {
                            const response = await setReviewVisibility(review.id, {visible: false, reason_code: reason || undefined, note: note || undefined, resolve_reports: true});
                            return {review: response.review, message: "Review hidden."};
                        });
                    }}>
                        {pendingAction === "hide-review" ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                        Hide review
                    </Button>
                    <Button disabled={Boolean(pendingAction)} type="button" variant="outline" onClick={() => {
                        void runAction("save-note", async () => {
                            const response = await saveReviewNote(review.id, {note});
                            return {review: response.review, message: "Note saved."};
                        });
                    }}>
                        {pendingAction === "save-note" ? <LoaderCircle className={styles.spin} size={16}/> : <StickyNote size={16}/>}
                        Save note
                    </Button>
                </div>
            </DecisionBox>
        </>
    );
}

function ReplyDrawer({
    detail,
    reasons,
    showSensitive,
    onReload,
}: {
    detail: AdminReviewReplyResponse;
    reasons: AdminReason[];
    showSensitive: boolean;
    onReload: () => void;
}) {
    const [reason, setReason] = useState(detail.reply.moderation_reason_code || reasons[0]?.code || "");
    const [note, setNote] = useState(detail.reply.moderation_note || "");
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const reply = detail.reply;
    const status = replyStatus(reply);

    useEffect(() => {
        setReason(detail.reply.moderation_reason_code || reasons[0]?.code || "");
        setNote(detail.reply.moderation_note || "");
    }, [detail.reply.id, detail.reply.moderation_note, detail.reply.moderation_reason_code, reasons]);

    async function runReplyAction(action: string, callback: () => Promise<AdminReplyDecisionResponse>, successMessage: string) {
        setPendingAction(action);
        setError("");
        setMessage("");
        try {
            const response = await callback();
            emitReviewUpdated(response.review);
            setMessage(successMessage);
            onReload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setPendingAction(null);
        }
    }

    return (
        <>
            <article className={styles.replyPreview}>
                <div className={styles.previewTop}>
                    <strong>{reply.author || (reply.op ? "Original poster" : "User")}</strong>
                    <span>{formatDateTime(reply.created_at)}</span>
                    <Badge className={styles.compactBadge} variant={status.tone}>{status.label}</Badge>
                    {reply.op && <Badge className={styles.compactBadge} variant="info">OP</Badge>}
                    {reply.reviewed && <Badge className={styles.compactBadge} variant="success"><CheckCircle2 size={12}/></Badge>}
                </div>
                <p>{reply.text}</p>
                {reply.gif && (
                    <div className={styles.replyGif}>
                        <img alt="Reply GIF" src={reply.gif}/>
                    </div>
                )}
                <div className={styles.dotMeta}>
                    <EntityLink target={{type: "reply", id: reply.id}}>Reply {reply.id}</EntityLink>
                    <span>{reply.like_count} likes</span>
                    {reply.mention && <span>Mentions {reply.mention}</span>}
                </div>
            </article>

            <DrawerSection title="Parent review">
                <SummaryRow
                    icon={<MessageSquareText size={15}/>}
                    title={detail.parent_review.text}
                    meta={[
                        detail.parent_review.professor_name,
                        `${detail.parent_review.score}/5`,
                        formatDateTime(detail.parent_review.created_at),
                    ]}
                    action={<EntityLink target={{type: "review", id: detail.parent_review.id}}>Review {detail.parent_review.id}</EntityLink>}
                />
            </DrawerSection>

            <DrawerSection title="Evidence">
                <FieldGrid>
                    <Field label="Session" value={<EntityLink target={{type: "session", id: reply.session_id}}>{reply.session_id}</EntityLink>}/>
                    {reply.user_id && <Field label="User" value={<EntityLink target={{type: "user", id: reply.user_id}}>{reply.user_id}</EntityLink>}/>}
                    {reply.ip_address && (
                        <Field label="IP address" value={<EntityLink target={{type: "ip", id: reply.ip_address}}>{maskIpAddress(reply.ip_address, showSensitive)}</EntityLink>}/>
                    )}
                    <Field label="Created" value={formatDateTime(reply.created_at)}/>
                </FieldGrid>
            </DrawerSection>

            <DrawerSection title="Reply likes" count={detail.likes.length}>
                <ActivityList empty="No reply likes recorded.">
                    {detail.likes.map(like => (
                        <SummaryRow
                            key={`${like.reply_id}-${like.session_id}-${like.created_at}`}
                            icon={<ThumbsUp size={15}/>}
                            title={<EntityLink target={{type: "session", id: like.session_id}}>Session {like.session_id}</EntityLink>}
                            meta={[
                                like.user_id ? <EntityLink key="user" target={{type: "user", id: like.user_id}}>User {like.user_id}</EntityLink> : "Anonymous session",
                                like.ip_address ? <EntityLink key="ip" target={{type: "ip", id: like.ip_address}}>{maskIpAddress(like.ip_address, showSensitive)}</EntityLink> : undefined,
                                formatDateTime(like.created_at),
                            ]}
                        />
                    ))}
                </ActivityList>
            </DrawerSection>

            <SignalsSection signals={detail.signals}/>
            <ActionsSection actions={detail.action_history}/>

            <DecisionBox
                disabled={!reasons.length || Boolean(pendingAction)}
                error={error}
                message={message}
                note={note}
                reason={reason}
                reasons={reasons}
                onNoteChange={setNote}
                onReasonChange={setReason}
            >
                <div className={styles.buttonRow}>
                    <Button disabled={reply.visible || Boolean(pendingAction)} type="button" onClick={() => {
                        void runReplyAction("show-reply", () => setReviewReplyVisibility(reply.id, {visible: true, reason_code: reason || undefined, note: note || undefined}), "Reply shown.");
                    }}>
                        {pendingAction === "show-reply" ? <LoaderCircle className={styles.spin} size={16}/> : <Eye size={16}/>}
                        Show
                    </Button>
                    <Button disabled={!reply.visible || !reason || Boolean(pendingAction)} type="button" variant="destructive" onClick={() => {
                        void runReplyAction("hide-reply", () => setReviewReplyVisibility(reply.id, {visible: false, reason_code: reason || undefined, note: note || undefined}), "Reply hidden.");
                    }}>
                        {pendingAction === "hide-reply" ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                        Hide
                    </Button>
                    <Button disabled={reply.reviewed || Boolean(pendingAction)} type="button" variant="outline" onClick={() => {
                        void runReplyAction("review-reply", () => markReviewReplyReviewed(reply.id, {reason_code: reason || undefined, note: note || undefined}), "Reply marked reviewed.");
                    }}>
                        {pendingAction === "review-reply" ? <LoaderCircle className={styles.spin} size={16}/> : <CheckCircle2 size={16}/>}
                        Reviewed
                    </Button>
                    <Button disabled={Boolean(pendingAction)} type="button" variant="outline" onClick={() => {
                        void runReplyAction("save-reply-note", () => saveReviewReplyNote(reply.id, {note}), "Note saved.");
                    }}>
                        {pendingAction === "save-reply-note" ? <LoaderCircle className={styles.spin} size={16}/> : <StickyNote size={16}/>}
                        Save note
                    </Button>
                </div>
            </DecisionBox>
        </>
    );
}

function SessionDrawer({detail, showSensitive}: { detail: AdminSessionDetailResponse; showSensitive: boolean }) {
    return (
        <>
            <StatsGrid stats={detail.stats}/>
            <DrawerSection title="Session">
                <FieldGrid>
                    <Field label="Session" value={detail.session.id}/>
                    {detail.session.user_id && <Field label="User" value={<EntityLink target={{type: "user", id: detail.session.user_id}}>{detail.session.user_id}</EntityLink>}/>}
                    <Field label="IP address" value={<EntityLink target={{type: "ip", id: detail.session.ip_address}}>{maskIpAddress(detail.session.ip_address, showSensitive)}</EntityLink>}/>
                    <Field label="Created" value={formatDateTime(detail.session.created_at)}/>
                    {detail.session.user_agent && <Field label="User agent" value={detail.session.user_agent}/>}
                </FieldGrid>
            </DrawerSection>
            <LoginSessionsSection sessions={detail.login_sessions} showSensitive={showSensitive}/>
            <ActivitySections activity={detail.activity} showSensitive={showSensitive}/>
        </>
    );
}

function UserDrawer({detail, showSensitive}: { detail: AdminUserDetailResponse; showSensitive: boolean }) {
    return (
        <>
            <StatsGrid stats={detail.stats}/>
            <DrawerSection title="User">
                <FieldGrid>
                    <Field label="User" value={detail.user.id}/>
                    <Field label="Username" value={detail.user.username}/>
                    <Field label="Email" value={maskEmail(detail.user.email, showSensitive)}/>
                    <Field label="Role" value={detail.user.role}/>
                    <Field label="Status" value={detail.user.status}/>
                    <Field label="Created" value={formatDateTime(detail.user.created_at)}/>
                    {detail.user.last_login_at && <Field label="Last login" value={formatDateTime(detail.user.last_login_at)}/>}
                </FieldGrid>
            </DrawerSection>
            <DrawerSection title="Identities" count={detail.identities.length}>
                <ActivityList empty="No identities recorded.">
                    {detail.identities.map(identity => (
                        <SummaryRow
                            key={identity.id}
                            icon={<ShieldCheck size={15}/>}
                            title={identity.provider}
                            meta={[
                                maskEmail(identity.email, showSensitive),
                                identity.email_verified ? "Verified" : "Unverified",
                                formatDateTime(identity.created_at),
                            ]}
                        />
                    ))}
                </ActivityList>
            </DrawerSection>
            <SessionsSection sessions={detail.sessions} showSensitive={showSensitive}/>
            <LoginSessionsSection sessions={detail.login_sessions} showSensitive={showSensitive}/>
            <ActivitySections activity={detail.activity} showSensitive={showSensitive}/>
        </>
    );
}

function IPDrawer({detail, showSensitive}: { detail: AdminIPDetailResponse; showSensitive: boolean }) {
    return (
        <>
            <StatsGrid stats={detail.stats}/>
            <DrawerSection title="IP address">
                <FieldGrid>
                    <Field label="IP address" value={maskIpAddress(detail.ip_address, showSensitive)}/>
                    {detail.stats.first_seen && <Field label="First seen" value={formatDateTime(detail.stats.first_seen)}/>}
                    {detail.stats.last_seen && <Field label="Last seen" value={formatDateTime(detail.stats.last_seen)}/>}
                </FieldGrid>
            </DrawerSection>
            <SessionsSection sessions={detail.sessions} showSensitive={showSensitive}/>
            <LoginSessionsSection sessions={detail.login_sessions} showSensitive={showSensitive}/>
            <ActivitySections activity={detail.activity} showSensitive={showSensitive}/>
        </>
    );
}

function ActivitySections({activity, showSensitive}: { activity: AdminEntityActivity; showSensitive: boolean }) {
    return (
        <>
            <DrawerSection title="Reviews" count={activity.reviews.length}>
                <ActivityList empty="No reviews recorded.">
                    {activity.reviews.map(review => <ReviewSummaryRow key={review.id} review={review} showSensitive={showSensitive}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Replies" count={activity.replies.length}>
                <ActivityList empty="No replies recorded.">
                    {activity.replies.map(reply => <ReplySummaryRow key={reply.id} reply={reply} showSensitive={showSensitive}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Reports" count={activity.reports.length}>
                <ActivityList empty="No reports recorded.">
                    {activity.reports.map(report => <ReportSummaryRow key={report.id} report={report}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Ratings" count={activity.ratings.length}>
                <ActivityList empty="No ratings recorded.">
                    {activity.ratings.map(rating => <RatingSummaryRow key={`${rating.review_id}-${rating.session_id}-${rating.created_at}`} rating={rating} showSensitive={showSensitive}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Reply likes" count={activity.reply_likes.length}>
                <ActivityList empty="No reply likes recorded.">
                    {activity.reply_likes.map(like => <ReplyLikeRow key={`${like.reply_id}-${like.session_id}-${like.created_at}`} like={like} showSensitive={showSensitive}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Professor requests" count={activity.professor_requests.length}>
                <ActivityList empty="No professor requests recorded.">
                    {activity.professor_requests.map(request => <ProfessorRequestRow key={request.id} request={request}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Course files" count={activity.course_files.length}>
                <ActivityList empty="No course files recorded.">
                    {activity.course_files.map(file => <CourseFileRow key={file.id} file={file}/>)}
                </ActivityList>
            </DrawerSection>
            <DrawerSection title="Attachments" count={activity.attachments.length}>
                <ActivityList empty="No attachments recorded.">
                    {activity.attachments.map(attachment => <AttachmentSummaryRow key={attachment.id} attachment={attachment} showSensitive={showSensitive}/>)}
                </ActivityList>
            </DrawerSection>
            <SignalsSection signals={activity.signals}/>
            <ActionsSection actions={activity.actions}/>
        </>
    );
}

function PublicReviewPreview({review}: { review: AdminReview }) {
    const media = reviewMedia(review);

    return (
        <article className={styles.reviewPreview}>
            <div className={styles.previewTop}>
                <strong>{review.student_verified ? "UAEU Student" : "User"}</strong>
                <span>{formatDateTime(review.created_at)}</span>
            </div>
            <div className={styles.reviewMeta}>
                <span>{review.score} out of 5</span>
                <span>{review.positive ? "Recommend" : "Do not recommend"}</span>
                {review.course_taken && <span>{review.course_taken}</span>}
                {review.grade_received && <span>{review.grade_received}</span>}
                {review.student_verified && <span>Verified student</span>}
            </div>
            <p>{review.text}</p>
            {media && (
                <div className={styles.previewMedia}>
                    <img alt={media.kind === "attachment" ? `Attachment ${media.id}` : "GIF preview"} src={media.url}/>
                </div>
            )}
            <div className={styles.dotMeta}>
                <span>{review.like_count} likes</span>
                <span>{review.dislike_count} dislikes</span>
                <span>{review.reply_count} replies</span>
                <span>{review.uaeu_origin ? "UAEU network" : "External network"}</span>
            </div>
        </article>
    );
}

function RatingsSection({
    ratings,
    likeCount,
    dislikeCount,
    showSensitive,
}: {
    ratings: AdminReviewRating[];
    likeCount: number;
    dislikeCount: number;
    showSensitive: boolean;
}) {
    return (
        <DrawerSection title="Likes and dislikes" count={ratings.length} action={(
            <div className={styles.pillCounter}>
                <ThumbsUp size={14}/>{likeCount}
                <ThumbsDown size={14}/>{dislikeCount}
            </div>
        )}>
            <ActivityList empty="No ratings recorded.">
                {ratings.map(rating => (
                    <SummaryRow
                        key={`${rating.value}-${rating.session_id}-${rating.created_at}`}
                        icon={rating.value === "like" ? <ThumbsUp size={15}/> : <ThumbsDown size={15}/>}
                        title={<EntityLink target={{type: "session", id: rating.session_id}}>Session {rating.session_id}</EntityLink>}
                        meta={[
                            rating.user_id ? <EntityLink key="user" target={{type: "user", id: rating.user_id}}>User {rating.user_id}</EntityLink> : "Anonymous session",
                            <EntityLink key="ip" target={{type: "ip", id: rating.ip_address}}>{maskIpAddress(rating.ip_address, showSensitive)}</EntityLink>,
                            formatDateTime(rating.created_at),
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function RepliesSection({replies, showSensitive}: { replies: AdminReviewReply[]; showSensitive: boolean }) {
    return (
        <DrawerSection title="Replies" count={replies.length}>
            <ActivityList empty="No replies recorded.">
                {replies.map(reply => (
                    <SummaryRow
                        key={reply.id}
                        icon={<MessageSquareText size={15}/>}
                        title={reply.text}
                        meta={[
                            <EntityLink key="reply" target={{type: "reply", id: reply.id}}>Reply {reply.id}</EntityLink>,
                            reply.author || (reply.op ? "Original poster" : "User"),
                            replyStatus(reply).label,
                            <EntityLink key="session" target={{type: "session", id: reply.session_id}}>Session {reply.session_id}</EntityLink>,
                            reply.user_id ? <EntityLink key="user" target={{type: "user", id: reply.user_id}}>User {reply.user_id}</EntityLink> : undefined,
                            reply.ip_address ? <EntityLink key="ip" target={{type: "ip", id: reply.ip_address}}>{maskIpAddress(reply.ip_address, showSensitive)}</EntityLink> : undefined,
                            `${reply.like_count} likes`,
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function ReportsSection({reports}: { reports: AdminReviewReport[] }) {
    return (
        <DrawerSection title="Reports" count={reports.length}>
            <ActivityList empty="No reports recorded.">
                {reports.map(report => (
                    <SummaryRow
                        key={report.id}
                        icon={<ShieldCheck size={15}/>}
                        title={report.reason}
                        meta={[
                            `Report ${report.id}`,
                            report.resolved ? "Closed" : "Open",
                            <EntityLink key="session" target={{type: "session", id: report.session_id}}>Session {report.session_id}</EntityLink>,
                            report.user_id ? <EntityLink key="user" target={{type: "user", id: report.user_id}}>User {report.user_id}</EntityLink> : undefined,
                            formatDateTime(report.created_at),
                            report.resolution_action ? actionLabel(report.resolution_action) : undefined,
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function SignalsSection({signals}: { signals: AdminModerationSignal[] }) {
    return (
        <DrawerSection title="Moderation signals" count={signals.length}>
            <ActivityList empty="No moderation signals recorded.">
                {signals.map(signal => (
                    <SummaryRow
                        key={signal.id || `${signal.target_type}-${signal.target_id}-${signal.attribute}-${signal.created_at}`}
                        icon={<ShieldCheck size={15}/>}
                        title={signal.attribute}
                        meta={[
                            signal.source,
                            signal.severity ? actionLabel(signal.severity) : undefined,
                            signal.score !== undefined ? `Score ${formatScore(signal.score)}` : undefined,
                            signal.threshold !== undefined ? `Threshold ${formatScore(signal.threshold)}` : undefined,
                            formatDateTime(signal.created_at),
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function ActionsSection({actions}: { actions: AdminModerationAction[] }) {
    return (
        <DrawerSection title="Action history" count={actions.length}>
            <ActivityList empty="No action history recorded.">
                {actions.map(action => (
                    <SummaryRow
                        key={action.id}
                        icon={<StickyNote size={15}/>}
                        title={actionLabel(action.action)}
                        meta={[
                            `${action.target_type} ${action.target_id}`,
                            action.actor_user_id ? <EntityLink key="actor" target={{type: "user", id: action.actor_user_id}}>Actor {action.actor_user_id}</EntityLink> : "System",
                            action.reason_code ? actionLabel(action.reason_code) : undefined,
                            action.note || undefined,
                            formatDateTime(action.created_at),
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function SessionsSection({sessions, showSensitive}: { sessions: AdminEntitySession[]; showSensitive: boolean }) {
    return (
        <DrawerSection title="Sessions" count={sessions.length}>
            <ActivityList empty="No sessions recorded.">
                {sessions.map(session => (
                    <SummaryRow
                        key={session.id}
                        icon={<Wifi size={15}/>}
                        title={<EntityLink target={{type: "session", id: session.id}}>Session {session.id}</EntityLink>}
                        meta={[
                            session.user_id ? <EntityLink key="user" target={{type: "user", id: session.user_id}}>User {session.user_id}</EntityLink> : "Anonymous session",
                            <EntityLink key="ip" target={{type: "ip", id: session.ip_address}}>{maskIpAddress(session.ip_address, showSensitive)}</EntityLink>,
                            formatDateTime(session.created_at),
                            session.user_agent,
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function LoginSessionsSection({sessions, showSensitive}: { sessions: AdminLoginSession[]; showSensitive: boolean }) {
    return (
        <DrawerSection title="Login sessions" count={sessions.length}>
            <ActivityList empty="No login sessions recorded.">
                {sessions.map(session => (
                    <SummaryRow
                        key={session.id}
                        icon={<UserRound size={15}/>}
                        title={`Login ${session.id}`}
                        meta={[
                            <EntityLink key="session" target={{type: "session", id: session.session_id}}>Session {session.session_id}</EntityLink>,
                            <EntityLink key="user" target={{type: "user", id: session.user_id}}>User {session.user_id}</EntityLink>,
                            session.ip_address ? <EntityLink key="ip" target={{type: "ip", id: session.ip_address}}>{maskIpAddress(session.ip_address, showSensitive)}</EntityLink> : undefined,
                            session.revoked_at ? "Revoked" : "Active",
                            `Seen ${formatDateTime(session.last_seen_at || session.created_at)}`,
                        ]}
                    />
                ))}
            </ActivityList>
        </DrawerSection>
    );
}

function ReviewSummaryRow({review, showSensitive}: { review: AdminReviewSummary; showSensitive: boolean }) {
    return (
        <SummaryRow
            icon={<MessageSquareText size={15}/>}
            title={review.text}
            meta={[
                <EntityLink key="review" target={{type: "review", id: review.id}}>Review {review.id}</EntityLink>,
                review.professor_name,
                `${review.score}/5`,
                review.visible ? "Visible" : "Hidden",
                review.open_report_count ? `${review.open_report_count} open reports` : undefined,
                review.signal_count ? `${review.signal_count} signals` : undefined,
                review.session_id ? <EntityLink key="session" target={{type: "session", id: review.session_id}}>Session {review.session_id}</EntityLink> : undefined,
                review.user_id ? <EntityLink key="user" target={{type: "user", id: review.user_id}}>User {review.user_id}</EntityLink> : undefined,
                review.ip_address ? <EntityLink key="ip" target={{type: "ip", id: review.ip_address}}>{maskIpAddress(review.ip_address, showSensitive)}</EntityLink> : undefined,
                formatDateTime(review.created_at),
            ]}
        />
    );
}

function ReplySummaryRow({reply, showSensitive}: { reply: AdminReviewReplySummary; showSensitive: boolean }) {
    return (
        <SummaryRow
            icon={<MessageSquareText size={15}/>}
            title={reply.text}
            meta={[
                <EntityLink key="reply" target={{type: "reply", id: reply.id}}>Reply {reply.id}</EntityLink>,
                <EntityLink key="review" target={{type: "review", id: reply.review_id}}>Review {reply.review_id}</EntityLink>,
                reply.professor_name,
                reply.visible ? "Visible" : "Hidden",
                <EntityLink key="session" target={{type: "session", id: reply.session_id}}>Session {reply.session_id}</EntityLink>,
                reply.user_id ? <EntityLink key="user" target={{type: "user", id: reply.user_id}}>User {reply.user_id}</EntityLink> : undefined,
                reply.ip_address ? <EntityLink key="ip" target={{type: "ip", id: reply.ip_address}}>{maskIpAddress(reply.ip_address, showSensitive)}</EntityLink> : undefined,
                formatDateTime(reply.created_at),
            ]}
        />
    );
}

function ReportSummaryRow({report}: { report: AdminReviewReportSummary }) {
    return (
        <SummaryRow
            icon={<ShieldCheck size={15}/>}
            title={report.reason}
            meta={[
                `Report ${report.id}`,
                <EntityLink key="review" target={{type: "review", id: report.review_id}}>Review {report.review_id}</EntityLink>,
                report.professor_name,
                report.resolved ? "Closed" : "Open",
                <EntityLink key="session" target={{type: "session", id: report.session_id}}>Session {report.session_id}</EntityLink>,
                report.user_id ? <EntityLink key="user" target={{type: "user", id: report.user_id}}>User {report.user_id}</EntityLink> : undefined,
                formatDateTime(report.created_at),
            ]}
        />
    );
}

function RatingSummaryRow({rating, showSensitive}: { rating: AdminReviewRatingSummary; showSensitive: boolean }) {
    return (
        <SummaryRow
            icon={rating.value === "like" ? <ThumbsUp size={15}/> : <ThumbsDown size={15}/>}
            title={rating.value === "like" ? "Like" : "Dislike"}
            meta={[
                <EntityLink key="review" target={{type: "review", id: rating.review_id}}>Review {rating.review_id}</EntityLink>,
                rating.professor_name,
                <EntityLink key="session" target={{type: "session", id: rating.session_id}}>Session {rating.session_id}</EntityLink>,
                rating.user_id ? <EntityLink key="user" target={{type: "user", id: rating.user_id}}>User {rating.user_id}</EntityLink> : undefined,
                <EntityLink key="ip" target={{type: "ip", id: rating.ip_address}}>{maskIpAddress(rating.ip_address, showSensitive)}</EntityLink>,
                formatDateTime(rating.created_at),
            ]}
        />
    );
}

function ReplyLikeRow({like, showSensitive}: { like: AdminReplyLike; showSensitive: boolean }) {
    return (
        <SummaryRow
            icon={<ThumbsUp size={15}/>}
            title={<EntityLink target={{type: "reply", id: like.reply_id}}>Reply {like.reply_id}</EntityLink>}
            meta={[
                <EntityLink key="session" target={{type: "session", id: like.session_id}}>Session {like.session_id}</EntityLink>,
                like.user_id ? <EntityLink key="user" target={{type: "user", id: like.user_id}}>User {like.user_id}</EntityLink> : "Anonymous session",
                like.ip_address ? <EntityLink key="ip" target={{type: "ip", id: like.ip_address}}>{maskIpAddress(like.ip_address, showSensitive)}</EntityLink> : undefined,
                formatDateTime(like.created_at),
            ]}
        />
    );
}

function ProfessorRequestRow({request}: { request: AdminProfessorRequestSummary }) {
    return (
        <SummaryRow
            icon={<UserRound size={15}/>}
            title={request.professor_name}
            meta={[
                `Request ${request.id}`,
                request.professor_email,
                request.university,
                request.college,
                actionLabel(request.status),
                <EntityLink key="session" target={{type: "session", id: request.session_id}}>Session {request.session_id}</EntityLink>,
                request.user_id ? <EntityLink key="user" target={{type: "user", id: request.user_id}}>User {request.user_id}</EntityLink> : undefined,
                formatDateTime(request.created_at),
            ]}
        />
    );
}

function CourseFileRow({file}: { file: AdminCourseFileSummary }) {
    return (
        <SummaryRow
            icon={<FileImage size={15}/>}
            title={file.name}
            meta={[
                `File ${file.id}`,
                file.course_tag,
                file.type,
                formatBytes(file.size),
                file.visible ? "Visible" : "Hidden",
                file.reviewed ? "Reviewed" : "Not reviewed",
                file.session_id ? <EntityLink key="session" target={{type: "session", id: file.session_id}}>Session {file.session_id}</EntityLink> : undefined,
                file.user_id ? <EntityLink key="user" target={{type: "user", id: file.user_id}}>User {file.user_id}</EntityLink> : undefined,
                formatDateTime(file.created_at),
            ]}
        />
    );
}

function AttachmentSummaryRow({attachment, showSensitive}: { attachment: AdminReviewAttachmentSummary; showSensitive: boolean }) {
    return (
        <SummaryRow
            icon={<FileImage size={15}/>}
            title={`Attachment ${attachment.id}`}
            meta={[
                attachment.review_id ? <EntityLink key="review" target={{type: "review", id: attachment.review_id}}>Review {attachment.review_id}</EntityLink> : undefined,
                attachment.mime_type,
                formatBytes(attachment.size),
                `${attachment.width} x ${attachment.height}`,
                attachment.visible ? "Visible" : "Hidden",
                attachment.ip_address ? <EntityLink key="ip" target={{type: "ip", id: attachment.ip_address}}>{maskIpAddress(attachment.ip_address, showSensitive)}</EntityLink> : undefined,
                formatDateTime(attachment.created_at),
            ]}
        />
    );
}

function DrawerSection({
    title,
    count,
    action,
    children,
}: {
    title: string;
    count?: number;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={styles.section}>
            <div className={styles.sectionHead}>
                <span>{title}</span>
                <div className={styles.sectionActions}>
                    {count !== undefined && <Badge className={styles.compactBadge} variant="outline">{count}</Badge>}
                    {action}
                </div>
            </div>
            {children}
        </section>
    );
}

function ActivityList({children, empty}: { children: ReactNode[] | ReactNode; empty: string }) {
    const items = Array.isArray(children) ? children.filter(Boolean) : children;
    if (Array.isArray(items) && items.length === 0) {
        return <p className={styles.emptyLine}>{empty}</p>;
    }
    return <div className={styles.list}>{items}</div>;
}

function SummaryRow({
    icon,
    title,
    meta,
    action,
}: {
    icon: ReactNode;
    title: ReactNode;
    meta: Array<ReactNode | undefined | false>;
    action?: ReactNode;
}) {
    return (
        <article className={styles.summaryRow}>
            <div className={styles.summaryIcon}>{icon}</div>
            <div className={styles.summaryBody}>
                <strong>{title}</strong>
                <div className={styles.dotMeta}>
                    {meta.filter(Boolean).map((item, index) => <span key={index}>{item}</span>)}
                </div>
            </div>
            {action && <div className={styles.summaryAction}>{action}</div>}
        </article>
    );
}

function FieldGrid({children}: { children: ReactNode }) {
    return <div className={styles.fieldGrid}>{children}</div>;
}

function Field({label, value}: { label: string; value: ReactNode }) {
    return (
        <div className={styles.field}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function StatsGrid({stats}: { stats: AdminEntityStats }) {
    return (
        <div className={styles.statsGrid}>
            <Stat label="Activity" value={stats.recent_activity_count}/>
            <Stat label="Hidden" value={stats.hidden_content_count}/>
            <Stat label="Open reports" value={stats.open_report_count}/>
            <Stat label="Signals" value={stats.signal_count}/>
            <Stat label="Sessions" value={stats.distinct_session_count || 0}/>
            <Stat label="Users" value={stats.distinct_user_count || 0}/>
        </div>
    );
}

function Stat({label, value}: { label: string; value: number }) {
    return (
        <div className={styles.stat}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function DecisionBox({
    children,
    disabled,
    error,
    message,
    note,
    reason,
    reasons,
    onNoteChange,
    onReasonChange,
}: {
    children: ReactNode;
    disabled: boolean;
    error: string;
    message: string;
    note: string;
    reason: string;
    reasons: AdminReason[];
    onNoteChange: (value: string) => void;
    onReasonChange: (value: string) => void;
}) {
    return (
        <section className={styles.decision}>
            <span className={styles.label}>Policy reason</span>
            <div className={styles.reasonOptions}>
                {reasons.map(option => (
                    <button
                        className={cn(styles.reasonButton, option.code === reason && styles.reasonSelected)}
                        disabled={disabled}
                        key={option.code}
                        type="button"
                        onClick={() => onReasonChange(option.code)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <Textarea disabled={disabled} placeholder="Internal note" value={note} onChange={event => onNoteChange(event.target.value)}/>
            {children}
            {error && <p className={styles.errorLine}>{error}</p>}
            {message && <p className={styles.successLine}>{message}</p>}
        </section>
    );
}

function MediaBlock({media, showSensitive}: { media: ReviewMedia; showSensitive: boolean }) {
    return (
        <article className={styles.mediaBlock}>
            <div className={styles.mediaPreview}>
                <img alt={media.kind === "attachment" ? `Attachment ${media.id}` : "GIF preview"} src={media.url}/>
            </div>
            <div className={styles.mediaBody}>
                <strong>{media.kind === "attachment" ? `Attachment ${media.id}` : "GIF"}</strong>
                <div className={styles.dotMeta}>
                    {media.kind === "attachment" ? (
                        <>
                            <span>{media.mime_type}</span>
                            <span>{formatBytes(media.size)}</span>
                            <span>{media.width} x {media.height}</span>
                            <span>{media.visible ? "Visible" : "Hidden"}</span>
                            {media.ip_address && <EntityLink target={{type: "ip", id: media.ip_address}}>{maskIpAddress(media.ip_address, showSensitive)}</EntityLink>}
                        </>
                    ) : (
                        <span>{media.url}</span>
                    )}
                </div>
            </div>
        </article>
    );
}

function DrawerLoading({error, onRetry}: { error: string | null; onRetry: () => void }) {
    return (
        <div className={styles.loadingBox}>
            {error ? (
                <>
                    <strong>Could not load details</strong>
                    <span>{error}</span>
                    <Button type="button" variant="outline" onClick={onRetry}>
                        <RefreshCw size={16}/>
                        Try again
                    </Button>
                </>
            ) : (
                <>
                    <LoaderCircle className={styles.spin} size={22}/>
                    <strong>Loading details</strong>
                </>
            )}
        </div>
    );
}

async function loadEntity(target: AdminEntityTarget, signal: AbortSignal): Promise<LoadedEntity> {
    if (target.type === "review") {
        const response = await getAdminReview(target.id, signal);
        return {type: "review", review: response.review};
    }
    if (target.type === "reply") {
        return {type: "reply", detail: await getAdminReviewReply(target.id, signal)};
    }
    if (target.type === "session") {
        return {type: "session", detail: await getAdminSessionDetail(target.id, signal)};
    }
    if (target.type === "user") {
        return {type: "user", detail: await getAdminUserDetail(target.id, signal)};
    }
    return {type: "ip", detail: await getAdminIPDetail(target.id, signal)};
}

type ReviewMedia =
    | ({ kind: "attachment" } & NonNullable<AdminReview["attachment"]>)
    | { kind: "gif"; url: string };

function reviewMedia(review: AdminReview): ReviewMedia | null {
    if (review.attachment) return {kind: "attachment", ...review.attachment};
    if (review.gif) return {kind: "gif", url: review.gif};
    return null;
}

function replyStatus(reply: AdminReviewReply): { label: string; tone: "default" | "warning" | "danger" | "success" | "info" } {
    if (reply.deleted_at) return {label: "Deleted", tone: "default"};
    if (!reply.visible) return {label: "Hidden", tone: "danger"};
    if (!reply.reviewed) return {label: "Visible", tone: "warning"};
    return {label: "Visible", tone: "success"};
}

function targetKey(target: AdminEntityTarget) {
    return `${target.type}:${target.id}`;
}

function targetTitle(target: AdminEntityTarget) {
    if (target.type === "ip") return `IP address ${target.id}`;
    const label = target.type.charAt(0).toUpperCase() + target.type.slice(1);
    return `${label} ${target.id}`;
}

function entitySubtitle(entity: LoadedEntity, showSensitive: boolean) {
    if (entity.type === "review") {
        return `${entity.review.professor_name} . ${entity.review.professor_email}`;
    }
    if (entity.type === "reply") {
        return `Review ${entity.detail.reply.review_id} . ${formatDateTime(entity.detail.reply.created_at)}`;
    }
    if (entity.type === "session") {
        return `${maskIpAddress(entity.detail.session.ip_address, showSensitive)} . ${formatDateTime(entity.detail.session.created_at)}`;
    }
    if (entity.type === "user") {
        return `${entity.detail.user.username} . ${maskEmail(entity.detail.user.email, showSensitive)}`;
    }
    return maskIpAddress(entity.detail.ip_address, showSensitive);
}

function publicReviewUrl(review: AdminReview) {
    return `${publicClientOrigin}/professor/${encodeURIComponent(review.professor_email)}#${review.id}`;
}

function emitReviewUpdated(review: AdminReview) {
    window.dispatchEvent(new CustomEvent<AdminReview>("admin-review-updated", {detail: review}));
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function formatDateTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
}

function formatScore(value?: number) {
    if (value === undefined) return "";
    return value.toFixed(value >= 10 ? 0 : 2).replace(/\.?0+$/, "");
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

function maskIpAddress(value: string, visible: boolean) {
    if (visible) return value;
    const parts = value.split(".");
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return value.replace(/[A-Fa-f0-9]/g, "x");
}

function maskEmail(value: string, visible: boolean) {
    if (visible) return value;
    const [local, domain] = value.split("@");
    if (!local || !domain) return "masked";
    return `${local.slice(0, 1)}***@${domain}`;
}

function actionLabel(value: string) {
    const text = value.replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}
