import {type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
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
    SlidersHorizontal,
    Star,
    ThumbsUp,
    Timer,
    UserRound,
    Wifi,
    X,
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
    hideSuspiciousReviewPairs,
    listAdminSuspiciousReviewPairs,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./suspicious_reviews.module.scss";

type LoadState = "loading" | "ready" | "error";
type BadgeTone = "default" | "warning" | "danger" | "info" | "success" | "outline";
type SuspiciousReviewGroup = {
    key: string;
    pairs: AdminSuspiciousReviewPair[];
    reviews: AdminReview[];
    suspicionScore: number;
    contentSimilarity: number;
    createdSpanSeconds: number;
};

const defaultFilters: AdminSuspiciousReviewFilters = {
    min_score: "5",
    similarity_threshold: "0.5",
    visible: "both",
    search: "",
    professor_email: "",
    include_content_only: "false",
};

const visibleOptions: { label: string; value: AdminSuspiciousReviewFilters["visible"] }[] = [
    {label: "All matched reviews visible", value: "both"},
    {label: "At least one visible", value: "at_least_one"},
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
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
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

    function applyFilters(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        setFilters({...draftFilters});
        setFiltersOpen(false);
        setSelectedGroupKeys(new Set());
    }

    function openFilters() {
        setFiltersOpen(true);
    }

    function cancelFilters() {
        setDraftFilters(filters);
        setFiltersOpen(false);
    }

    function resetDraftFilters() {
        setDraftFilters(defaultFilters);
    }

    function resetFilters() {
        setDraftFilters(defaultFilters);
        setFilters(defaultFilters);
        setFiltersOpen(false);
        setSelectedGroupKeys(new Set());
    }

    const groups = useMemo(() => groupSuspiciousReviewPairs(pairs), [pairs]);
    const totalSignals = useMemo(() => groups.reduce((sum, group) => sum + groupSignals(group, showSensitive).length, 0), [groups, showSensitive]);
    const extraReviewCount = useMemo(() => groups.reduce((sum, group) => sum + Math.max(0, group.reviews.length - 1), 0), [groups]);
    const activeFilterCount = countActiveFilters(filters);
    const draftFilterCount = countActiveFilters(draftFilters);
    const appliedFilterChips = useMemo(() => filterChips(filters), [filters]);
    const draftDirty = !filtersEqual(draftFilters, filters);
    const defaultFiltersSelected = filtersEqual(filters, defaultFilters);
    const defaultDraftSelected = filtersEqual(draftFilters, defaultFilters);
    const reasonOptions = useMemo(() => activeReasonOptions(reasons), [reasons]);
    const visibleGroupKeys = useMemo(() => groups.map(group => group.key), [groups]);
    const selectedVisibleCount = visibleGroupKeys.filter(key => selectedGroupKeys.has(key)).length;
    const allVisibleGroupsSelected = visibleGroupKeys.length > 0 && selectedVisibleCount === visibleGroupKeys.length;

    useEffect(() => {
        const visibleKeys = new Set(visibleGroupKeys);
        setSelectedGroupKeys(current => {
            const next = new Set([...current].filter(key => visibleKeys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [visibleGroupKeys]);

    useEffect(() => {
        setBulkReason(current => (
            current && reasonOptions.some(option => option.code === current)
                ? current
                : reasonOptions[0]?.code || ""
        ));
    }, [reasonOptions]);

    useEffect(() => {
        if (!filtersOpen) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousBodyOverscroll = document.body.style.overscrollBehavior;
        const previousBodyPaddingRight = document.body.style.paddingRight;
        const previousDocumentOverscroll = document.documentElement.style.overscrollBehavior;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = "hidden";
        document.body.style.overscrollBehavior = "none";
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        document.documentElement.style.overscrollBehavior = "none";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.body.style.overscrollBehavior = previousBodyOverscroll;
            document.body.style.paddingRight = previousBodyPaddingRight;
            document.documentElement.style.overscrollBehavior = previousDocumentOverscroll;
        };
    }, [filtersOpen]);

    function updatePairReviews(review1: AdminReview, review2: AdminReview) {
        setPairs(current => current.map(pair => ({
            ...pair,
            review_1: replaceReview(pair.review_1, review1, review2),
            review_2: replaceReview(pair.review_2, review1, review2),
        })));
    }

    function toggleGroupSelection(key: string, checked: boolean) {
        setBulkMessage("");
        setBulkError("");
        setSelectedGroupKeys(current => {
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
        setSelectedGroupKeys(current => {
            const next = new Set(current);
            if (allVisibleGroupsSelected) {
                visibleGroupKeys.forEach(key => next.delete(key));
            } else {
                visibleGroupKeys.forEach(key => next.add(key));
            }
            return next;
        });
    }

    function clearGroupSelection() {
        setBulkMessage("");
        setBulkError("");
        setSelectedGroupKeys(new Set());
    }

    async function runBulkKeepLatest(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const targets = groups.filter(group => selectedGroupKeys.has(group.key));
        if (targets.length === 0) return;
        if (!bulkReason) {
            setBulkError("Choose a reason before hiding older reviews.");
            return;
        }

        setBulkPending(true);
        setBulkMessage("");
        setBulkError("");

        try {
            const response = await hideSuspiciousReviewPairs({
                pairs: targets.flatMap(group => group.pairs).map(pair => ({
                    review_1_id: pair.review_1.id,
                    review_2_id: pair.review_2.id,
                })),
                reason_code: bulkReason,
                note: bulkNote || undefined,
                resolve_reports: true,
            });
            response.pairs.forEach(pair => updatePairReviews(pair.review_1, pair.review_2));
            setSelectedGroupKeys(new Set());
            const olderReviewCount = targets.reduce((sum, group) => sum + visibleOlderReviewCount(group), 0);
            setBulkMessage(bulkSuccessMessage(targets.length, olderReviewCount, response.resolved_report_count));
        } catch (err: unknown) {
            setBulkError(err instanceof AdminApiError ? err.message : "Older reviews could not be hidden.");
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
                <SummaryStat icon={<UserRound size={16}/>} label="Repeat groups" value={groups.length}/>
                <SummaryStat icon={<Gauge size={16}/>} label="Older reviews" value={extraReviewCount}/>
                <SummaryStat icon={<AlertCircle size={16}/>} label="Signals" value={totalSignals}/>
            </section>

            <section className={styles.filters} aria-label="Suspicious review filters">
                <form className={styles.filterToolbar} onSubmit={applyFilters}>
                    <label className={styles.filterSearch}>
                        <Search size={16}/>
                        <Input
                            aria-label="Search suspicious reviews"
                            placeholder="Search professor, review ID, or text"
                            value={draftFilters.search}
                            onChange={event => updateDraft("search", event.target.value)}
                        />
                    </label>
                    <div className={styles.quickFilters}>
                        <label className={styles.compactFilterField}>
                            <span>Score</span>
                            <Input
                                aria-label="Minimum score"
                                min="0"
                                max="31"
                                type="number"
                                value={draftFilters.min_score}
                                onChange={event => updateDraft("min_score", event.target.value)}
                            />
                        </label>
                        <label className={styles.compactFilterField}>
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
                    </div>
                    <div className={styles.filterActions}>
                        <Button disabled={!draftDirty} type="submit">
                            <Search size={16}/>
                            Apply
                        </Button>
                        <Button type="button" variant="outline" onClick={openFilters}>
                            <SlidersHorizontal size={16}/>
                            More
                            {activeFilterCount > 0 && <Badge className={styles.filterCountBadge} variant="warning">{activeFilterCount}</Badge>}
                        </Button>
                        <Button disabled={defaultFiltersSelected && defaultDraftSelected} type="button" variant="ghost" onClick={resetFilters}>
                            <RotateCcw size={16}/>
                            Reset
                        </Button>
                    </div>
                </form>
                <div className={styles.appliedFilterRow}>
                    {appliedFilterChips.length > 0 ? appliedFilterChips.map(chip => (
                        <span key={chip.key}>{chip.label}</span>
                    )) : <span>Default queue</span>}
                </div>
                {filtersOpen && createPortal((
                    <div className={styles.filterSheetLayer}>
                        <button aria-label="Close filters" className={styles.filterSheetBackdrop} type="button" onClick={cancelFilters}/>
                        <aside aria-label="Suspicious review filters" aria-modal="true" className={styles.filterSheet} role="dialog">
                            <header className={styles.filterSheetHeader}>
                                <div>
                                    <span><Filter size={14}/> Filters</span>
                                    <h2>Suspicious review fields</h2>
                                    <p>{draftDirty ? `${draftFilterCount} changed fields` : "No unapplied changes"}</p>
                                </div>
                                <Button size="icon" type="button" variant="ghost" aria-label="Close filters" onClick={cancelFilters}>
                                    <X size={16}/>
                                </Button>
                            </header>

                            <div className={styles.filterSheetBody}>
                                <FilterGroup title="Find repeated reviewers">
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
                                    <label className={cn(styles.filterToggle, draftFilters.include_content_only === "true" && styles.filterActive)}>
                                        <input
                                            checked={draftFilters.include_content_only === "true"}
                                            type="checkbox"
                                            onChange={event => updateDraft("include_content_only", event.target.checked ? "true" : "false")}
                                        />
                                        <span>Content-only matches</span>
                                    </label>
                                </FilterGroup>

                                <FilterGroup title="Thresholds">
                                    <div className={styles.rangePair}>
                                        <label className={styles.filterField}>
                                            <span>Minimum score</span>
                                            <Input
                                                min="0"
                                                max="31"
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
                                    </div>
                                </FilterGroup>

                                <FilterGroup title="Visibility">
                                    <label className={styles.filterField}>
                                        <span>Visible reviews</span>
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
                                </FilterGroup>
                            </div>

                            <footer className={styles.filterSheetFooter}>
                                <Button disabled={defaultDraftSelected} size="sm" type="button" variant="outline" onClick={resetDraftFilters}>
                                    <RotateCcw size={15}/>
                                    Reset
                                </Button>
                                <Button size="sm" type="button" variant="ghost" onClick={cancelFilters}>
                                    Cancel
                                </Button>
                                <Button disabled={!draftDirty} size="sm" type="button" onClick={() => applyFilters()}>
                                    <CheckCircle2 size={15}/>
                                    Apply filters
                                </Button>
                            </footer>
                        </aside>
                    </div>
                ), document.body)}
            </section>

            {groups.length > 0 && (
                <form className={styles.bulkBar} onSubmit={runBulkKeepLatest}>
                    <label className={styles.selectionToggle}>
                        <input
                            checked={allVisibleGroupsSelected}
                            type="checkbox"
                            onChange={toggleVisibleSelection}
                        />
                        <span>{selectedVisibleCount} of {visibleGroupKeys.length} groups selected</span>
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
                        <Button disabled={selectedVisibleCount === 0 || bulkPending} type="button" variant="outline" onClick={clearGroupSelection}>
                            Clear
                        </Button>
                        <Button disabled={selectedVisibleCount === 0 || bulkPending || !bulkReason} type="submit" variant="destructive">
                            {bulkPending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                            Keep latest in selected
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
                {loadState === "ready" && groups.length === 0 && (
                    <div className={styles.stateNotice}>
                        <CheckCircle2 size={20}/>
                        <div>
                            <strong>No repeated reviewers found</strong>
                            <span>Each visible reviewer currently has at most one matched review per professor.</span>
                        </div>
                    </div>
                )}
                {groups.length > 0 && (
                    <div className={styles.pairList}>
                        {groups.map(group => (
                            <SuspiciousGroupRow
                                key={group.key}
                                group={group}
                                reasonOptions={reasonOptions}
                                selectedForBatch={selectedGroupKeys.has(group.key)}
                                showSensitive={showSensitive}
                                onGroupUpdated={updates => updates.forEach(pair => updatePairReviews(pair.review_1, pair.review_2))}
                                onSelectionChange={checked => toggleGroupSelection(group.key, checked)}
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

function FilterGroup({title, children}: { title: string; children: ReactNode }) {
    return (
        <div className={styles.filterGroup}>
            <strong>{title}</strong>
            <div>{children}</div>
        </div>
    );
}

function SuspiciousGroupRow({
    group,
    reasonOptions,
    selectedForBatch,
    showSensitive,
    onGroupUpdated,
    onSelectionChange,
    onOpenReview,
}: {
    group: SuspiciousReviewGroup;
    reasonOptions: AdminReason[];
    selectedForBatch: boolean;
    showSensitive: boolean;
    onGroupUpdated: (pairs: { review_1: AdminReview; review_2: AdminReview }[]) => void;
    onSelectionChange: (checked: boolean) => void;
    onOpenReview: (review: AdminReview) => void;
}) {
    const latestReview = group.reviews[0];
    const olderReviews = group.reviews.slice(1);
    const visibleOlderCount = olderReviews.filter(review => review.visible).length;
    const signals = groupSignals(group, showSensitive);
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        setReason(current => (
            current && reasonOptions.some(option => option.code === current)
                ? current
                : reasonOptions[0]?.code || ""
        ));
    }, [reasonOptions]);

    async function runKeepLatest(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!reason) {
            setError("Choose a reason before hiding older reviews.");
            return;
        }

        setPending(true);
        setError("");
        setMessage("");

        try {
            const response = await hideSuspiciousReviewPairs({
                pairs: group.pairs.map(pair => ({
                    review_1_id: pair.review_1.id,
                    review_2_id: pair.review_2.id,
                })),
                reason_code: reason,
                note: note || undefined,
                resolve_reports: true,
            });
            onGroupUpdated(response.pairs);
            setMessage(response.resolved_report_count > 0
                ? `${visibleOlderCount} older ${pluralizeReview(visibleOlderCount)} hidden. Latest review #${latestReview.id} kept. ${response.resolved_report_count} reports resolved.`
                : `${visibleOlderCount} older ${pluralizeReview(visibleOlderCount)} hidden. Latest review #${latestReview.id} kept.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not hide older reviews.");
        } finally {
            setPending(false);
        }
    }

    return (
        <article className={cn(styles.pairRow, selectedForBatch && styles.pairSelected)}>
            <header className={styles.pairHeader}>
                <div className={styles.pairTitle}>
                    <label className={styles.pairSelector} aria-label={`Select ${group.reviews.length} matched reviews for ${latestReview.professor_name}`}>
                        <input
                            checked={selectedForBatch}
                            type="checkbox"
                            onChange={event => onSelectionChange(event.target.checked)}
                        />
                    </label>
                    <Badge className={styles.scoreBadge} variant={scoreTone(group.suspicionScore)}>
                        Score {group.suspicionScore}
                    </Badge>
                    <div>
                        <strong>{latestReview.professor_name}</strong>
                        <span>{latestReview.professor_email}</span>
                    </div>
                </div>
                <div className={styles.pairMeta}>
                    <Badge variant="danger">{group.reviews.length} reviews from one matched reviewer</Badge>
                    <Badge variant="info">Up to {formatPercent(group.contentSimilarity)} text match</Badge>
                    <Badge variant="outline">{formatDuration(group.createdSpanSeconds)} span</Badge>
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
                <ReviewCard
                    isLatest
                    label="Latest review · keep"
                    review={latestReview}
                    showSensitive={showSensitive}
                    onOpen={() => onOpenReview(latestReview)}
                />
                {olderReviews.map((review, index) => (
                    <ReviewCard
                        key={review.id}
                        label={`Older review ${index + 1}`}
                        review={review}
                        showSensitive={showSensitive}
                        onOpen={() => onOpenReview(review)}
                    />
                ))}
            </div>

            <form className={styles.pairAction} onSubmit={runKeepLatest}>
                <p className={styles.actionExplainer}>
                    Review #{latestReview.id} is the newest and will remain unchanged. {visibleOlderCount} visible older {pluralizeReview(visibleOlderCount)} will stop counting.
                </p>
                <label className={styles.actionField}>
                    <span>Reason</span>
                    <select
                        className={styles.selectInput}
                        disabled={pending || visibleOlderCount === 0 || reasonOptions.length === 0}
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
                        disabled={pending || visibleOlderCount === 0}
                        placeholder="Optional"
                        value={note}
                        onChange={event => setNote(event.target.value)}
                    />
                </label>
                <Button disabled={pending || visibleOlderCount === 0 || !reason} type="submit" variant="destructive">
                    {pending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                    Hide {visibleOlderCount} older
                </Button>
                {message ? <p className={styles.actionStatus}>{message}</p> : visibleOlderCount === 0 && <p className={styles.actionStatus}>Only the latest matched review can still count.</p>}
                {error && <p className={styles.actionError}>{error}</p>}
            </form>
        </article>
    );
}

function ReviewCard({
    isLatest = false,
    label,
    review,
    showSensitive,
    onOpen,
}: {
    isLatest?: boolean;
    label: string;
    review: AdminReview;
    showSensitive: boolean;
    onOpen: () => void;
}) {
    return (
        <article className={cn(styles.reviewCard, isLatest && styles.latestReviewCard)}>
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
                {isLatest && <Badge variant="success">Latest · counts if visible</Badge>}
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

function groupSuspiciousReviewPairs(pairs: AdminSuspiciousReviewPair[]): SuspiciousReviewGroup[] {
    const parents = new Map<string, string>();
    const reviewsById = new Map<string, AdminReview>();

    for (const pair of pairs) {
        parents.set(pair.review_1.id, pair.review_1.id);
        parents.set(pair.review_2.id, pair.review_2.id);
        reviewsById.set(pair.review_1.id, pair.review_1);
        reviewsById.set(pair.review_2.id, pair.review_2);
    }

    function find(id: string): string {
        const parent = parents.get(id) || id;
        if (parent !== id) {
            const root = find(parent);
            parents.set(id, root);
            return root;
        }
        return parent;
    }

    function union(firstId: string, secondId: string) {
        const firstRoot = find(firstId);
        const secondRoot = find(secondId);
        if (firstRoot !== secondRoot) {
            parents.set(secondRoot, firstRoot);
        }
    }

    pairs.forEach(pair => union(pair.review_1.id, pair.review_2.id));

    const pairsByRoot = new Map<string, AdminSuspiciousReviewPair[]>();
    for (const pair of pairs) {
        const root = find(pair.review_1.id);
        const groupPairs = pairsByRoot.get(root) || [];
        groupPairs.push(pair);
        pairsByRoot.set(root, groupPairs);
    }

    const groups = [...pairsByRoot.values()].map(groupPairs => {
        const reviewIds = new Set<string>();
        for (const pair of groupPairs) {
            reviewIds.add(pair.review_1.id);
            reviewIds.add(pair.review_2.id);
        }
        const reviews = [...reviewIds]
            .map(id => reviewsById.get(id))
            .filter((review): review is AdminReview => Boolean(review))
            .sort(compareReviewsNewestFirst);
        const newestTimestamp = Date.parse(reviews[0]?.created_at || "");
        const oldestTimestamp = Date.parse(reviews[reviews.length - 1]?.created_at || "");

        return {
            key: [...reviewIds].sort().join(":"),
            pairs: groupPairs,
            reviews,
            suspicionScore: Math.max(...groupPairs.map(pair => pair.suspicion_score)),
            contentSimilarity: Math.max(...groupPairs.map(pair => pair.content_similarity)),
            createdSpanSeconds: Number.isFinite(newestTimestamp) && Number.isFinite(oldestTimestamp)
                ? Math.max(0, Math.round((newestTimestamp - oldestTimestamp) / 1000))
                : 0,
        };
    });

    return groups.sort((first, second) => compareReviewsNewestFirst(first.reviews[0], second.reviews[0]));
}

function compareReviewsNewestFirst(first?: AdminReview, second?: AdminReview) {
    const timeDifference = Date.parse(second?.created_at || "") - Date.parse(first?.created_at || "");
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    return (second?.id || "").localeCompare(first?.id || "", undefined, {numeric: true});
}

function groupSignals(group: SuspiciousReviewGroup, showSensitive: boolean) {
    const signalsByKey = new Map<string, ReturnType<typeof pairSignals>[number]>();
    for (const pair of group.pairs) {
        for (const signal of pairSignals(pair, showSensitive)) {
            if (!signalsByKey.has(signal.key)) {
                signalsByKey.set(signal.key, signal);
            }
        }
    }
    return [...signalsByKey.values()].sort((first, second) => second.weight - first.weight);
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

    if (pair.same_session) {
        signals.push({
            key: "same_session",
            label: "Same session",
            weight: 6,
            tone: "danger",
            icon: <UserRound size={13}/>,
            detail: pair.review_1.session_id ? <EntityLink target={{type: "session", id: pair.review_1.session_id}}>{pair.review_1.session_id}</EntityLink> : undefined,
        });
    }
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
        const sharedUaeuIP = pair.same_uaeu_ip;
        signals.push({
            key: "same_ip",
            label: sharedUaeuIP ? "Same UAEU IP" : "Same IP",
            weight: sharedUaeuIP ? 1 : 3,
            tone: sharedUaeuIP ? "warning" : "danger",
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
    if (pair.same_thumbmark) {
        signals.push({
            key: "same_thumbmark",
            label: "Same thumbmark",
            weight: 4,
            tone: "danger",
            icon: <Fingerprint size={13}/>,
            detail: pair.review_1.thumbmark_fingerprint ? maskFingerprint(pair.review_1.thumbmark_fingerprint, showSensitive) : undefined,
        });
    }
    if (pair.same_creep) {
        signals.push({
            key: "same_creep",
            label: "Same creep",
            weight: 4,
            tone: "danger",
            icon: <Fingerprint size={13}/>,
            detail: pair.review_1.creep_fingerprint ? maskFingerprint(pair.review_1.creep_fingerprint, showSensitive) : undefined,
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

function filtersEqual(a: AdminSuspiciousReviewFilters, b: AdminSuspiciousReviewFilters) {
    return (Object.keys(defaultFilters) as Array<keyof AdminSuspiciousReviewFilters>)
        .every(key => a[key] === b[key]);
}

function filterChips(filters: AdminSuspiciousReviewFilters) {
    const chips: { key: string; label: string }[] = [];
    if (filters.search.trim()) {
        chips.push({key: "search", label: `Search: ${filters.search.trim()}`});
    }
    if (filters.professor_email.trim()) {
        chips.push({key: "professor_email", label: `Email: ${filters.professor_email.trim()}`});
    }
    if (filters.min_score !== defaultFilters.min_score) {
        chips.push({key: "min_score", label: `Score ${filters.min_score || "0"}+`});
    }
    if (filters.similarity_threshold !== defaultFilters.similarity_threshold) {
        chips.push({key: "similarity_threshold", label: `Similarity ${formatPercent(Number(filters.similarity_threshold))}+`});
    }
    if (filters.visible !== defaultFilters.visible) {
        const selected = visibleOptions.find(option => option.value === filters.visible);
        chips.push({key: "visible", label: selected?.label || filters.visible});
    }
    if (filters.include_content_only === "true") {
        chips.push({key: "include_content_only", label: "Content-only"});
    }
    return chips;
}

function visibleOlderReviewCount(group: SuspiciousReviewGroup) {
    return group.reviews.slice(1).filter(review => review.visible).length;
}

function pluralizeReview(count: number) {
    return count === 1 ? "review" : "reviews";
}

function bulkSuccessMessage(groupCount: number, reviewCount: number, resolvedReports: number) {
    const groupLabel = groupCount === 1 ? "group" : "groups";
    const message = `${reviewCount} older ${pluralizeReview(reviewCount)} hidden across ${groupCount} ${groupLabel}. The latest review in each group was kept.`;
    if (resolvedReports > 0) {
        return `${message} ${resolvedReports} reports resolved.`;
    }
    return message;
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

function maskFingerprint(value: string, visible: boolean) {
    if (visible || value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
