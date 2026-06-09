import {type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    Fingerprint,
    Filter,
    Gauge,
    Languages,
    LoaderCircle,
    MessageSquareText,
    RefreshCw,
    RotateCcw,
    Search,
    Star,
    ThumbsUp,
    Timer,
    UserRound,
    Wifi,
} from "lucide-react";
import {BidiParagraph} from "@/components/admin/bidi_text";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    AdminApiError,
    type AdminReason,
    type AdminReview,
    type AdminSuspiciousReviewFilters,
    type AdminSuspiciousReviewPair,
    hideSuspiciousReviewPair,
    hideSuspiciousReviewPairs,
    listAdminSuspiciousReviewPairs,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./suspicious_reviews.module.scss";

type LoadState = "loading" | "ready" | "error";
type BadgeTone = "default" | "warning" | "danger" | "info" | "success" | "outline";

const defaultFilters: AdminSuspiciousReviewFilters = {
    min_score: "5",
    similarity_threshold: "0.5",
    visible: "at_least_one",
    search: "",
    professor_email: "",
    include_content_only: "false",
};

const visibleOptions: { label: string; value: AdminSuspiciousReviewFilters["visible"] }[] = [
    {label: "At least one visible", value: "at_least_one"},
    {label: "Both visible", value: "both"},
    {label: "Include hidden", value: "include_hidden"},
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

export function SuspiciousReviewsPage() {
    const [pairs, setPairs] = useState<AdminSuspiciousReviewPair[]>([]);
    const [filters, setFilters] = useState<AdminSuspiciousReviewFilters>(defaultFilters);
    const [draftFilters, setDraftFilters] = useState<AdminSuspiciousReviewFilters>(defaultFilters);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedPairKeys, setSelectedPairKeys] = useState<Set<string>>(new Set());
    const [bulkReason, setBulkReason] = useState("");
    const [bulkNote, setBulkNote] = useState("");
    const [bulkPending, setBulkPending] = useState(false);
    const [bulkMessage, setBulkMessage] = useState("");
    const [bulkError, setBulkError] = useState("");
    const {openEntity, reasons, showSensitive, toggleSensitive} = useAdminEntityDrawer();

    const loadPairs = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        listAdminSuspiciousReviewPairs(controller.signal, filters)
            .then(response => {
                setPairs(response.pairs);
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                setError(err instanceof AdminApiError ? err.message : "Could not load suspicious reviews.");
            })
            .finally(() => setIsRefreshing(false));

        return () => controller.abort();
    }, [filters]);

    useEffect(() => loadPairs("initial"), [loadPairs]);

    function updateDraft<K extends keyof AdminSuspiciousReviewFilters>(key: K, value: AdminSuspiciousReviewFilters[K]) {
        setDraftFilters(current => ({...current, [key]: value}));
    }

    function applyFilters(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFilters({...draftFilters});
    }

    function resetFilters() {
        setDraftFilters(defaultFilters);
        setFilters(defaultFilters);
    }

    const totalSignals = useMemo(() => pairs.reduce((sum, pair) => sum + pairSignals(pair, showSensitive).length, 0), [pairs, showSensitive]);
    const activeFilterCount = countActiveFilters(filters);
    const reasonOptions = useMemo(() => activeReasonOptions(reasons), [reasons]);
    const visiblePairKeys = useMemo(() => pairs.map(pairKey), [pairs]);
    const selectedVisibleCount = visiblePairKeys.filter(key => selectedPairKeys.has(key)).length;
    const allVisiblePairsSelected = visiblePairKeys.length > 0 && selectedVisibleCount === visiblePairKeys.length;

    useEffect(() => {
        const visibleKeys = new Set(visiblePairKeys);
        setSelectedPairKeys(current => {
            const next = new Set([...current].filter(key => visibleKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [visiblePairKeys]);

    useEffect(() => {
        setBulkReason(current => (
            current && reasonOptions.some(option => option.code === current)
                ? current
                : reasonOptions[0]?.code || ""
        ));
    }, [reasonOptions]);

    function updatePairReviews(review1: AdminReview, review2: AdminReview) {
        setPairs(current => current.map(pair => ({
            ...pair,
            review_1: replaceReview(pair.review_1, review1, review2),
            review_2: replaceReview(pair.review_2, review1, review2),
        })));
    }

    function togglePairSelection(key: string, checked: boolean) {
        setBulkMessage("");
        setBulkError("");
        setSelectedPairKeys(current => {
            const next = new Set(current);
            if (checked) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    }

    function toggleVisibleSelection() {
        setBulkMessage("");
        setBulkError("");
        setSelectedPairKeys(current => {
            const next = new Set(current);
            if (allVisiblePairsSelected) {
                visiblePairKeys.forEach(key => next.delete(key));
            } else {
                visiblePairKeys.forEach(key => next.add(key));
            }
            return next;
        });
    }

    function clearPairSelection() {
        setBulkMessage("");
        setBulkError("");
        setSelectedPairKeys(new Set());
    }

    async function runBulkHideBoth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const targets = pairs.filter(pair => selectedPairKeys.has(pairKey(pair)));
        if (targets.length === 0) return;
        if (!bulkReason) {
            setBulkError("Choose a reason before hiding selected pairs.");
            return;
        }

        setBulkPending(true);
        setBulkMessage("");
        setBulkError("");

        try {
            const response = await hideSuspiciousReviewPairs({
                pairs: targets.map(pair => ({
                    review_1_id: pair.review_1.id,
                    review_2_id: pair.review_2.id,
                })),
                reason_code: bulkReason,
                note: bulkNote || undefined,
                resolve_reports: true,
            });
            response.pairs.forEach(pair => updatePairReviews(pair.review_1, pair.review_2));
            setSelectedPairKeys(new Set());
            setBulkMessage(bulkSuccessMessage(response.pairs.length, response.resolved_report_count));
        } catch (err: unknown) {
            setBulkError(err instanceof AdminApiError ? err.message : "Selected pairs could not be hidden.");
        } finally {
            setBulkPending(false);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Reviews</p>
                    <h1 className={styles.title}>Suspicious reviews</h1>
                </div>
                <div className={styles.introActions}>
                    {isRefreshing && <span className={cn(styles.previewNote, styles.refreshingNote)}>Refreshing</span>}
                    <Button className={styles.refreshButton} disabled={isRefreshing} type="button" variant="outline" onClick={() => loadPairs("refresh")}>
                        {isRefreshing ? <LoaderCircle className={styles.spin} size={16}/> : <RefreshCw size={16}/>}
                        Refresh
                    </Button>
                    <Button type="button" variant="outline" onClick={toggleSensitive}>
                        {showSensitive ? <EyeOff size={16}/> : <Eye size={16}/>}
                        {showSensitive ? "Hide sensitive" : "Show sensitive"}
                    </Button>
                </div>
            </div>

            <section className={styles.summaryStrip} aria-label="Suspicious review summary">
                <SummaryStat icon={<Gauge size={16}/>} label="Pairs" value={pairs.length}/>
                <SummaryStat icon={<Filter size={16}/>} label="Filters" value={activeFilterCount}/>
                <SummaryStat icon={<AlertCircle size={16}/>} label="Signals" value={totalSignals}/>
            </section>

            <section className={styles.filters} aria-label="Suspicious review filters">
                <form className={styles.filterGrid} onSubmit={applyFilters}>
                    <label className={styles.filterField}>
                        <span>Search</span>
                        <Input
                            placeholder="Professor, review ID, or text"
                            value={draftFilters.search}
                            onChange={event => updateDraft("search", event.target.value)}
                        />
                    </label>
                    <label className={styles.filterField}>
                        <span>Professor email</span>
                        <Input
                            placeholder="name@uaeu.ac.ae"
                            value={draftFilters.professor_email}
                            onChange={event => updateDraft("professor_email", event.target.value)}
                        />
                    </label>
                    <label className={styles.filterField}>
                        <span>Minimum score</span>
                        <Input
                            min="0"
                            max="17"
                            type="number"
                            value={draftFilters.min_score}
                            onChange={event => updateDraft("min_score", event.target.value)}
                        />
                    </label>
                    <label className={styles.filterField}>
                        <span>Similarity</span>
                        <Input
                            max="1"
                            min="0.3"
                            step="0.05"
                            type="number"
                            value={draftFilters.similarity_threshold}
                            onChange={event => updateDraft("similarity_threshold", event.target.value)}
                        />
                    </label>
                    <label className={styles.filterField}>
                        <span>Visibility</span>
                        <select
                            className={styles.selectInput}
                            value={draftFilters.visible}
                            onChange={event => updateDraft("visible", event.target.value as AdminSuspiciousReviewFilters["visible"])}
                        >
                            {visibleOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <div className={styles.filterField}>
                        <span>Text scan</span>
                        <label className={cn(styles.filterToggle, draftFilters.include_content_only === "true" && styles.filterActive)}>
                            <input
                                checked={draftFilters.include_content_only === "true"}
                                type="checkbox"
                                onChange={event => updateDraft("include_content_only", event.target.checked ? "true" : "false")}
                            />
                            <span>Content-only</span>
                        </label>
                    </div>
                    <div className={styles.filterActions}>
                        <Button type="submit">
                            <Search size={16}/>
                            Apply
                        </Button>
                        <Button type="button" variant="outline" onClick={resetFilters}>
                            <RotateCcw size={16}/>
                            Reset
                        </Button>
                    </div>
                </form>
            </section>

            {pairs.length > 0 && (
                <form className={styles.bulkBar} onSubmit={runBulkHideBoth}>
                    <label className={styles.selectionToggle}>
                        <input
                            checked={allVisiblePairsSelected}
                            type="checkbox"
                            onChange={toggleVisibleSelection}
                        />
                        <span>{selectedVisibleCount} of {visiblePairKeys.length} pairs selected</span>
                    </label>
                    <label className={styles.bulkField}>
                        <span>Reason</span>
                        <select
                            className={styles.selectInput}
                            disabled={bulkPending || reasonOptions.length === 0}
                            value={bulkReason}
                            onChange={event => setBulkReason(event.target.value)}
                        >
                            {reasonOptions.length === 0 && <option value="">No active reasons</option>}
                            {reasonOptions.map(option => (
                                <option key={option.code} value={option.code}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={cn(styles.bulkField, styles.bulkNote)}>
                        <span>Internal note</span>
                        <Input
                            disabled={bulkPending}
                            placeholder="Optional"
                            value={bulkNote}
                            onChange={event => setBulkNote(event.target.value)}
                        />
                    </label>
                    <div className={styles.bulkActions}>
                        <Button disabled={selectedVisibleCount === 0 || bulkPending} type="button" variant="outline" onClick={clearPairSelection}>
                            Clear
                        </Button>
                        <Button disabled={selectedVisibleCount === 0 || bulkPending || !bulkReason} type="submit" variant="destructive">
                            {bulkPending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                            Hide selected
                        </Button>
                    </div>
                    {bulkMessage && <p className={styles.actionStatus}>{bulkMessage}</p>}
                    {bulkError && <p className={styles.actionError}>{bulkError}</p>}
                </form>
            )}

            <section className={cn(styles.feed, isRefreshing && styles.refreshingFeed)}>
                {loadState === "loading" && pairs.length === 0 && <SkeletonList/>}
                {loadState === "error" && pairs.length === 0 && (
                    <div className={cn(styles.stateNotice, styles.errorNotice)}>
                        <AlertCircle size={20}/>
                        <div>
                            <strong>Suspicious reviews could not be loaded</strong>
                            <span>{error || "The admin service did not return a usable response."}</span>
                        </div>
                        <Button type="button" variant="outline" onClick={() => loadPairs("initial")}>
                            <RefreshCw size={16}/>
                            Refresh
                        </Button>
                    </div>
                )}
                {loadState === "ready" && pairs.length === 0 && (
                    <div className={styles.stateNotice}>
                        <CheckCircle2 size={20}/>
                        <div>
                            <strong>No suspicious pairs found</strong>
                            <span>Try lowering the minimum score or widening the visibility filter.</span>
                        </div>
                    </div>
                )}
                {pairs.length > 0 && (
                    <div className={styles.pairList}>
                        {pairs.map(pair => (
                            <SuspiciousPairRow
                                key={`${pair.review_1.id}-${pair.review_2.id}`}
                                pair={pair}
                                reasonOptions={reasonOptions}
                                selectedForBatch={selectedPairKeys.has(pairKey(pair))}
                                showSensitive={showSensitive}
                                onPairHidden={updatePairReviews}
                                onSelectionChange={checked => togglePairSelection(pairKey(pair), checked)}
                                onOpenReview={review => openEntity({type: "review", id: review.id})}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function SummaryStat({icon, label, value}: { icon: ReactNode; label: string; value: number }) {
    return (
        <div className={styles.summaryStat}>
            <span>{icon}</span>
            <div>
                <strong>{value}</strong>
                <small>{label}</small>
            </div>
        </div>
    );
}

function SuspiciousPairRow({
    pair,
    reasonOptions,
    selectedForBatch,
    showSensitive,
    onPairHidden,
    onSelectionChange,
    onOpenReview,
}: {
    pair: AdminSuspiciousReviewPair;
    reasonOptions: AdminReason[];
    selectedForBatch: boolean;
    showSensitive: boolean;
    onPairHidden: (review1: AdminReview, review2: AdminReview) => void;
    onSelectionChange: (checked: boolean) => void;
    onOpenReview: (review: AdminReview) => void;
}) {
    const signals = pairSignals(pair, showSensitive);
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const bothHidden = !pair.review_1.visible && !pair.review_2.visible;

    useEffect(() => {
        setReason(current => (
            current && reasonOptions.some(option => option.code === current)
                ? current
                : reasonOptions[0]?.code || ""
        ));
    }, [reasonOptions]);

    async function runHideBoth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!reason) {
            setError("Choose a reason before hiding reviews.");
            return;
        }

        setPending(true);
        setError("");
        setMessage("");

        try {
            const response = await hideSuspiciousReviewPair({
                review_1_id: pair.review_1.id,
                review_2_id: pair.review_2.id,
                reason_code: reason,
                note: note || undefined,
                resolve_reports: true,
            });
            onPairHidden(response.review_1, response.review_2);
            setMessage(response.resolved_report_count > 0
                ? `Both reviews hidden. ${response.resolved_report_count} reports resolved.`
                : "Both reviews hidden.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not hide both reviews.");
        } finally {
            setPending(false);
        }
    }

    return (
        <article className={cn(styles.pairRow, selectedForBatch && styles.pairSelected)}>
            <header className={styles.pairHeader}>
                <div className={styles.pairTitle}>
                    <label className={styles.pairSelector} aria-label={`Select reviews ${pair.review_1.id} and ${pair.review_2.id}`}>
                        <input
                            checked={selectedForBatch}
                            type="checkbox"
                            onChange={event => onSelectionChange(event.target.checked)}
                        />
                    </label>
                    <Badge className={styles.scoreBadge} variant={scoreTone(pair.suspicion_score)}>
                        Score {pair.suspicion_score}
                    </Badge>
                    <div>
                        <strong>{pair.review_1.professor_name}</strong>
                        <span>{pair.review_1.professor_email}</span>
                    </div>
                </div>
                <div className={styles.pairMeta}>
                    <Badge variant="info">{formatPercent(pair.content_similarity)} text match</Badge>
                    <Badge variant="outline">{formatDuration(pair.created_delta_seconds)} apart</Badge>
                </div>
            </header>

            <div className={styles.signalList}>
                {signals.map(signal => (
                    <Badge className={styles.signalBadge} key={signal.key} variant={signal.tone}>
                        <span>{signal.icon}</span>
                        {signal.label}
                        <strong>+{signal.weight}</strong>
                        {signal.detail && <em>{signal.detail}</em>}
                    </Badge>
                ))}
            </div>

            <div className={styles.reviewGrid}>
                <ReviewCard label="First review" review={pair.review_1} showSensitive={showSensitive} onOpen={() => onOpenReview(pair.review_1)}/>
                <ReviewCard label="Second review" review={pair.review_2} showSensitive={showSensitive} onOpen={() => onOpenReview(pair.review_2)}/>
            </div>

            <form className={styles.pairAction} onSubmit={runHideBoth}>
                <label className={styles.actionField}>
                    <span>Reason</span>
                    <select
                        className={styles.selectInput}
                        disabled={pending || bothHidden || reasonOptions.length === 0}
                        value={reason}
                        onChange={event => setReason(event.target.value)}
                    >
                        {reasonOptions.length === 0 && <option value="">No active reasons</option>}
                        {reasonOptions.map(option => (
                            <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                    </select>
                </label>
                <label className={cn(styles.actionField, styles.actionNote)}>
                    <span>Internal note</span>
                    <Input
                        disabled={pending || bothHidden}
                        placeholder="Optional"
                        value={note}
                        onChange={event => setNote(event.target.value)}
                    />
                </label>
                <Button disabled={pending || bothHidden || !reason} type="submit" variant="destructive">
                    {pending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                    Hide both
                </Button>
                {message ? <p className={styles.actionStatus}>{message}</p> : bothHidden && <p className={styles.actionStatus}>Both reviews are hidden.</p>}
                {error && <p className={styles.actionError}>{error}</p>}
            </form>
        </article>
    );
}

function ReviewCard({
    label,
    review,
    showSensitive,
    onOpen,
}: {
    label: string;
    review: AdminReview;
    showSensitive: boolean;
    onOpen: () => void;
}) {
    return (
        <article className={styles.reviewCard}>
            <div className={styles.reviewCardHead}>
                <div>
                    <span>{label}</span>
                    <strong><EntityLink target={{type: "review", id: review.id}}>#{review.id}</EntityLink></strong>
                </div>
                <Button size="sm" type="button" variant="outline" onClick={onOpen}>
                    <MessageSquareText size={15}/>
                    Open
                </Button>
            </div>
            <BidiParagraph className={styles.reviewText}>{review.text}</BidiParagraph>
            <div className={styles.reviewBadges}>
                <Badge variant={review.visible ? "success" : "danger"}>{review.visible ? "Visible" : "Hidden"}</Badge>
                <Badge variant={review.reviewed ? "success" : "warning"}>{review.reviewed ? "Reviewed" : "Not reviewed"}</Badge>
                <Badge variant={review.positive ? "success" : "danger"}>{review.score}/5</Badge>
            </div>
            <div className={styles.reviewMeta}>
                <span>{formatDateTime(review.created_at)}</span>
                {review.session_id && <EntityLink target={{type: "session", id: review.session_id}}>Session {review.session_id}</EntityLink>}
                {review.user_id && <EntityLink target={{type: "user", id: review.user_id}}>User {review.user_id}</EntityLink>}
                {review.ip_address && (
                    <EntityLink target={{type: "ip", id: review.ip_address}}>
                        {maskIpAddress(review.ip_address, showSensitive)}
                    </EntityLink>
                )}
                {review.course_taken && <span>{review.course_taken}</span>}
            </div>
        </article>
    );
}

function SkeletonList() {
    return (
        <div className={styles.pairList}>
            {Array.from({length: 4}).map((_, index) => (
                <div className={styles.skeletonRow} key={index}>
                    <span/>
                    <span/>
                    <span/>
                </div>
            ))}
        </div>
    );
}

function pairSignals(pair: AdminSuspiciousReviewPair, showSensitive: boolean) {
    const signals: {
        key: string;
        label: string;
        weight: number;
        tone: BadgeTone;
        icon: ReactNode;
        detail?: ReactNode;
    }[] = [];

    if (pair.same_user) {
        signals.push({
            key: "same_user",
            label: "Same user",
            weight: 5,
            tone: "danger",
            icon: <UserRound size={13}/>,
            detail: pair.review_1.user_id ? <EntityLink target={{type: "user", id: pair.review_1.user_id}}>{pair.review_1.user_id}</EntityLink> : undefined,
        });
    }
    if (pair.same_ip) {
        signals.push({
            key: "same_ip",
            label: "Same IP",
            weight: 3,
            tone: "danger",
            icon: <Wifi size={13}/>,
            detail: pair.review_1.ip_address ? (
                <EntityLink target={{type: "ip", id: pair.review_1.ip_address}}>
                    {maskIpAddress(pair.review_1.ip_address, showSensitive)}
                </EntityLink>
            ) : undefined,
        });
    }
    if (pair.same_user_agent) {
        signals.push({
            key: "same_user_agent",
            label: "Same agent",
            weight: 2,
            tone: "warning",
            icon: <Fingerprint size={13}/>,
            detail: pair.review_1.user_agent ? maskUserAgent(pair.review_1.user_agent, showSensitive) : undefined,
        });
    }
    if (pair.similar_content) {
        signals.push({
            key: "similar_content",
            label: "Similar text",
            weight: 2,
            tone: "warning",
            icon: <MessageSquareText size={13}/>,
            detail: formatPercent(pair.content_similarity),
        });
    }
    if (pair.close_timing) {
        signals.push({
            key: "close_timing",
            label: "Close timing",
            weight: 2,
            tone: "warning",
            icon: <Timer size={13}/>,
            detail: formatDuration(pair.created_delta_seconds),
        });
    }
    if (pair.same_language) {
        signals.push({
            key: "same_language",
            label: "Same language",
            weight: 1,
            tone: "info",
            icon: <Languages size={13}/>,
            detail: pair.review_1.language,
        });
    }
    if (pair.same_score) {
        signals.push({
            key: "same_score",
            label: "Same score",
            weight: 1,
            tone: "info",
            icon: <Star size={13}/>,
            detail: `${pair.review_1.score}/5`,
        });
    }
    if (pair.same_recommendation) {
        signals.push({
            key: "same_recommendation",
            label: "Same verdict",
            weight: 1,
            tone: "info",
            icon: <ThumbsUp size={13}/>,
            detail: pair.review_1.positive ? "Recommended" : "Not recommended",
        });
    }

    return signals;
}

function scoreTone(score: number): BadgeTone {
    if (score >= 9) return "danger";
    if (score >= 6) return "warning";
    return "info";
}

function countActiveFilters(filters: AdminSuspiciousReviewFilters) {
    return (Object.keys(defaultFilters) as Array<keyof AdminSuspiciousReviewFilters>)
        .filter(key => filters[key] !== defaultFilters[key])
        .length;
}

function pairKey(pair: AdminSuspiciousReviewPair) {
    return `${pair.review_1.id}:${pair.review_2.id}`;
}

function bulkSuccessMessage(pairCount: number, resolvedReports: number) {
    const pairLabel = pairCount === 1 ? "pair" : "pairs";
    if (resolvedReports > 0) {
        return `${pairCount} ${pairLabel} hidden. ${resolvedReports} reports resolved.`;
    }
    return `${pairCount} ${pairLabel} hidden.`;
}

function activeReasonOptions(reasons: AdminReason[]) {
    return reasons
        .filter(reason => reason.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

function replaceReview(current: AdminReview, review1: AdminReview, review2: AdminReview) {
    if (current.id === review1.id) return review1;
    if (current.id === review2.id) return review2;
    return current;
}

function formatPercent(value: number) {
    if (!Number.isFinite(value)) return "0%";
    return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
    return `${Math.round(seconds / 86400)} days`;
}

function formatDateTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
}

function maskIpAddress(value: string, visible: boolean) {
    const displayValue = value.replace(/\/32$/, "").replace(/\/128$/, "");
    if (visible) return displayValue;
    const parts = displayValue.split(".");
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return displayValue.replace(/[A-Fa-f0-9]/g, "x");
}

function maskUserAgent(value: string, visible: boolean) {
    if (visible) return value;
    return "Hidden";
}
