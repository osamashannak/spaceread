import {type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    FileImage,
    Film,
    Filter,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    SlidersHorizontal,
    StickyNote,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react";
import {BidiParagraph} from "@/components/admin/bidi_text";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
    AdminApiError,
    type AdminReason,
    type AdminReviewFilters,
    type AdminReview,
    listAdminReasons,
    listAdminReviews,
    saveReviewNote,
    setReviewVisibility,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./moderation.module.scss";

type LoadState = "loading" | "ready" | "error";
type Tone = "default" | "warning" | "danger" | "info" | "success";
type ReviewFilterKey = keyof AdminReviewFilters;
type SelectFilterKey = {
    [K in ReviewFilterKey]: AdminReviewFilters[K] extends string ? K : never
}[ReviewFilterKey];
type FilterSectionKey = "common" | "status" | "identity" | "content" | "metrics";
type BulkReviewAction = "keep" | "hide" | "note";

const defaultReviewFilters: AdminReviewFilters = {
    sort: "newest",
    needs_attention: true,
    deleted: "exclude",
    visible: "any",
    reviewed: "any",
    positive: "any",
    student_verified: "any",
    uaeu_origin: "any",
    media: "any",
    open_reports: "any",
    signals: "any",
    has_session: "any",
    has_user: "any",
    has_ip: "any",
    search: "",
    review_id: "",
    professor_email: "",
    professor_name: "",
    professor_college: "",
    professor_university: "",
    language: "",
    course_taken: "",
    grade_received: "",
    moderation_reason_code: "",
    reviewer_user_id: "",
    session_id: "",
    user_id: "",
    ip_address: "",
    score_min: "",
    score_max: "",
    like_min: "",
    like_max: "",
    dislike_min: "",
    dislike_max: "",
    reply_min: "",
    reply_max: "",
    created_from: "",
    created_to: "",
    reviewed_from: "",
    reviewed_to: "",
};

const stateFilters: {
    key: SelectFilterKey;
    label: string;
    options: { label: string; value: string }[];
}[] = [
    {key: "sort", label: "Sort", options: [{label: "Newest first", value: "newest"}, {label: "Oldest first", value: "oldest"}, {label: "Most reports", value: "most_reports"}, {label: "Most signals", value: "most_signals"}, {label: "Random on refresh", value: "random"}]},
    {key: "deleted", label: "Deleted", options: [{label: "Exclude", value: "exclude"}, {label: "Include", value: "include"}, {label: "Only", value: "only"}]},
    {key: "visible", label: "Visibility", options: [{label: "Any", value: "any"}, {label: "Visible", value: "visible"}, {label: "Hidden", value: "hidden"}]},
    {key: "reviewed", label: "Reviewed", options: [{label: "Any", value: "any"}, {label: "Reviewed", value: "reviewed"}, {label: "Not reviewed", value: "not_reviewed"}]},
    {key: "positive", label: "Recommendation", options: [{label: "Any", value: "any"}, {label: "Recommended", value: "recommended"}, {label: "Not recommended", value: "not_recommended"}]},
    {key: "student_verified", label: "Student verified", options: [{label: "Any", value: "any"}, {label: "Verified", value: "verified"}, {label: "Not verified", value: "not_verified"}]},
    {key: "uaeu_origin", label: "UAEU origin", options: [{label: "Any", value: "any"}, {label: "UAEU", value: "uaeu"}, {label: "Non-UAEU", value: "non_uaeu"}]},
    {key: "media", label: "Media", options: [{label: "Any", value: "any"}, {label: "Has media", value: "with_media"}, {label: "No media", value: "without_media"}, {label: "Attachment", value: "attachment"}, {label: "GIF", value: "gif"}]},
    {key: "open_reports", label: "Open reports", options: [{label: "Any", value: "any"}, {label: "Has open reports", value: "has"}, {label: "No open reports", value: "none"}]},
    {key: "signals", label: "Signals", options: [{label: "Any", value: "any"}, {label: "Has signals", value: "has"}, {label: "No signals", value: "none"}]},
    {key: "has_session", label: "Session", options: [{label: "Any", value: "any"}, {label: "Has session", value: "has"}, {label: "No session", value: "none"}]},
    {key: "has_user", label: "User", options: [{label: "Any", value: "any"}, {label: "Has user", value: "has"}, {label: "No user", value: "none"}]},
    {key: "has_ip", label: "IP address", options: [{label: "Any", value: "any"}, {label: "Has IP", value: "has"}, {label: "No IP", value: "none"}]},
];

const textFilters: { key: SelectFilterKey; label: string; placeholder?: string }[] = [
    {key: "search", label: "Search", placeholder: "Text, professor, reason, note"},
    {key: "review_id", label: "Review ID"},
    {key: "professor_email", label: "Professor email"},
    {key: "professor_name", label: "Professor name"},
    {key: "professor_college", label: "College"},
    {key: "professor_university", label: "University"},
    {key: "language", label: "Language"},
    {key: "course_taken", label: "Course"},
    {key: "grade_received", label: "Grade"},
    {key: "moderation_reason_code", label: "Reason code"},
    {key: "reviewer_user_id", label: "Reviewer ID"},
    {key: "session_id", label: "Session ID"},
    {key: "user_id", label: "User ID"},
    {key: "ip_address", label: "IP address"},
];

const rangeFilters: { label: string; minKey: SelectFilterKey; maxKey: SelectFilterKey; type?: "number" | "date" }[] = [
    {label: "Score", minKey: "score_min", maxKey: "score_max", type: "number"},
    {label: "Likes", minKey: "like_min", maxKey: "like_max", type: "number"},
    {label: "Dislikes", minKey: "dislike_min", maxKey: "dislike_max", type: "number"},
    {label: "Replies", minKey: "reply_min", maxKey: "reply_max", type: "number"},
    {label: "Created", minKey: "created_from", maxKey: "created_to", type: "date"},
    {label: "Reviewed at", minKey: "reviewed_from", maxKey: "reviewed_to", type: "date"},
];

const filterSections: { key: FilterSectionKey; label: string }[] = [
    {key: "common", label: "Common"},
    {key: "status", label: "Status"},
    {key: "identity", label: "Identity"},
    {key: "content", label: "Content"},
    {key: "metrics", label: "Metrics"},
];

const sectionSelectFilterKeys: Record<FilterSectionKey, SelectFilterKey[]> = {
    common: ["sort"],
    status: ["deleted", "visible", "reviewed", "positive", "student_verified", "uaeu_origin", "media", "open_reports", "signals"],
    identity: ["has_session", "has_user", "has_ip"],
    content: [],
    metrics: [],
};

const sectionTextFilterKeys: Record<FilterSectionKey, SelectFilterKey[]> = {
    common: ["search"],
    status: [],
    identity: ["review_id", "professor_email", "professor_name", "professor_college", "professor_university", "reviewer_user_id", "session_id", "user_id", "ip_address"],
    content: ["language", "course_taken", "grade_received", "moderation_reason_code"],
    metrics: [],
};

const sectionRangeFilterKeys: Record<FilterSectionKey, SelectFilterKey[]> = {
    common: [],
    status: [],
    identity: [],
    content: [],
    metrics: ["score_min", "like_min", "dislike_min", "reply_min", "created_from", "reviewed_from"],
};

const sectionFilterKeys: Record<FilterSectionKey, ReviewFilterKey[]> = {
    common: ["sort", "needs_attention", "search"],
    status: ["deleted", "visible", "reviewed", "positive", "student_verified", "uaeu_origin", "media", "open_reports", "signals"],
    identity: ["has_session", "has_user", "has_ip", "review_id", "professor_email", "professor_name", "professor_college", "professor_university", "reviewer_user_id", "session_id", "user_id", "ip_address"],
    content: ["language", "course_taken", "grade_received", "moderation_reason_code"],
    metrics: ["score_min", "score_max", "like_min", "like_max", "dislike_min", "dislike_max", "reply_min", "reply_max", "created_from", "created_to", "reviewed_from", "reviewed_to"],
};

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
    const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
    const [reasons, setReasons] = useState<AdminReason[]>([]);
    const [filters, setFilters] = useState<AdminReviewFilters>(defaultReviewFilters);
    const [draftFilters, setDraftFilters] = useState<AdminReviewFilters>(defaultReviewFilters);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [activeFilterSection, setActiveFilterSection] = useState<FilterSectionKey>("common");
    const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
    const [bulkReason, setBulkReason] = useState("");
    const [bulkNote, setBulkNote] = useState("");
    const [bulkPendingAction, setBulkPendingAction] = useState<BulkReviewAction | null>(null);
    const [bulkMessage, setBulkMessage] = useState("");
    const [bulkError, setBulkError] = useState("");
    const [bulkActionMessage, setBulkActionMessage] = useState("");
    const {openEntity} = useAdminEntityDrawer();

    const loadReviews = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        listAdminReviews(controller.signal, filters)
            .then(response => {
                setReviews(response.reviews.filter(review => reviewMatchesFilters(review, filters)));
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
    }, [filters]);

    useEffect(() => loadReviews("initial"), [loadReviews]);

    useEffect(() => {
        const controller = new AbortController();
        listAdminReasons(controller.signal)
            .then(response => setReasons(response.reasons))
            .catch(() => {
                if (!controller.signal.aborted) {
                    setReasons([]);
                }
            });
        return () => controller.abort();
    }, []);

    const overlayOpen = filtersOpen || bulkActionsOpen;

    useEffect(() => {
        if (!overlayOpen) return;

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
    }, [overlayOpen]);

    useEffect(() => {
        function onReviewUpdated(event: Event) {
            const review = (event as CustomEvent<AdminReview>).detail;
            setReviews(current => {
                const next = current.filter(item => item.id !== review.id);
                if (reviewMatchesFilters(review, filters)) {
                    next.push(review);
                }
                return next;
            });
        }

        window.addEventListener("admin-review-updated", onReviewUpdated);
        return () => window.removeEventListener("admin-review-updated", onReviewUpdated);
    }, [filters]);

    useEffect(() => {
        const visibleIds = new Set(reviews.map(review => review.id));
        setSelectedReviewIds(current => {
            const next = new Set([...current].filter(id => visibleIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [reviews]);

    const orderedReviews = useMemo(() => sortReviews(reviews, filters.sort), [filters.sort, reviews]);
    const visibleReviewIds = useMemo(() => orderedReviews.map(review => review.id), [orderedReviews]);
    const selectedVisibleCount = visibleReviewIds.filter(id => selectedReviewIds.has(id)).length;
    const allVisibleReviewsSelected = visibleReviewIds.length > 0 && selectedVisibleCount === visibleReviewIds.length;
    const bulkReasonOptions = useMemo(() => activeReasonOptions(reasons), [reasons]);
    const defaultFiltersSelected = filtersEqual(filters, defaultReviewFilters);
    const appliedFilterChips = useMemo(() => filterChips(filters), [filters]);
    const draftFilterCount = countActiveFilters(draftFilters);
    const draftDirty = !filtersEqual(draftFilters, filters);
    const activeSelectFilters = stateFilters.filter(filter => sectionSelectFilterKeys[activeFilterSection].includes(filter.key));
    const activeTextFilters = textFilters.filter(filter => sectionTextFilterKeys[activeFilterSection].includes(filter.key));
    const activeRangeFilters = rangeFilters.filter(filter => sectionRangeFilterKeys[activeFilterSection].includes(filter.minKey));

    useEffect(() => {
        setBulkReason(current => (
            current && bulkReasonOptions.some(reason => reason.code === current)
                ? current
                : bulkReasonOptions[0]?.code || ""
        ));
    }, [bulkReasonOptions]);

    function openReview(review: AdminReview) {
        setSelectedId(review.id);
        openEntity({type: "review", id: review.id});
    }

    function updateFilter<K extends ReviewFilterKey>(key: K, value: AdminReviewFilters[K]) {
        setDraftFilters(current => ({...current, [key]: value}));
    }

    function applyFilters() {
        setFilters({...draftFilters});
        setFiltersOpen(false);
        setSelectedId(null);
        setSelectedReviewIds(new Set());
    }

    function openFilters() {
        setDraftFilters(filters);
        setFiltersOpen(true);
    }

    function toggleFilters() {
        if (filtersOpen) {
            cancelFilters();
            return;
        }
        openFilters();
    }

    function cancelFilters() {
        setDraftFilters(filters);
        setFiltersOpen(false);
    }

    function resetDraftFilters() {
        setDraftFilters(defaultReviewFilters);
    }

    function toggleReviewSelection(reviewId: string, checked: boolean) {
        setBulkActionMessage("");
        setSelectedReviewIds(current => {
            const next = new Set(current);
            if (checked) {
                next.add(reviewId);
            } else {
                next.delete(reviewId);
            }
            return next;
        });
    }

    function toggleVisibleSelection() {
        setBulkActionMessage("");
        setSelectedReviewIds(current => {
            const next = new Set(current);
            if (allVisibleReviewsSelected) {
                visibleReviewIds.forEach(id => next.delete(id));
            } else {
                visibleReviewIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    function clearReviewSelection() {
        setBulkActionMessage("");
        setSelectedReviewIds(new Set());
    }

    function openBulkActions() {
        setBulkMessage("");
        setBulkError("");
        setBulkActionMessage("");
        setBulkActionsOpen(true);
    }

    function closeBulkActions() {
        if (bulkPendingAction) return;
        setBulkActionsOpen(false);
        setBulkMessage("");
        setBulkError("");
    }

    async function runBulkAction(action: BulkReviewAction) {
        const targetIds = orderedReviews
            .map(review => review.id)
            .filter(id => selectedReviewIds.has(id));
        if (targetIds.length === 0) return;
        if (action === "hide" && !bulkReason) {
            setBulkError("Choose a reason before hiding reviews.");
            return;
        }

        setBulkPendingAction(action);
        setBulkMessage("");
        setBulkError("");

        const failedIds: string[] = [];
        let successCount = 0;

        for (const reviewId of targetIds) {
            try {
                const response = action === "note"
                    ? await saveReviewNote(reviewId, {note: bulkNote})
                    : await setReviewVisibility(reviewId, {
                        visible: action === "keep",
                        reason_code: bulkReason || undefined,
                        note: bulkNote || undefined,
                        resolve_reports: true,
                    });
                emitReviewUpdated(response.review);
                successCount += 1;
            } catch {
                failedIds.push(reviewId);
            }
        }

        setBulkPendingAction(null);

        if (failedIds.length > 0) {
            setSelectedReviewIds(new Set(failedIds));
            setBulkMessage(successCount > 0 ? `${successCount} reviews updated.` : "");
            setBulkError(`${failedIds.length} reviews failed. They are still selected.`);
            return;
        }

        const label = action === "hide" ? "hidden" : action === "keep" ? "kept public" : "updated";
        setSelectedReviewIds(new Set());
        setBulkActionMessage(`${successCount} reviews ${label}.`);
        setBulkActionsOpen(false);
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

            <section className={styles.filters} aria-label="Review filters">
                <div className={styles.filterBar}>
                    <button className={cn(styles.filterSummaryButton, filtersOpen && styles.filterSummaryOpen)} type="button" onClick={toggleFilters}>
                        <SlidersHorizontal size={16}/>
                        <span>Filters</span>
                        <Badge className={styles.filterCountBadge} variant={defaultFiltersSelected ? "info" : "warning"}>
                            {defaultFiltersSelected ? "Default" : `${appliedFilterChips.length} active`}
                        </Badge>
                    </button>
                    <div className={styles.appliedChips}>
                        {appliedFilterChips.slice(0, 5).map(chip => (
                            <span key={chip.key}>{chip.label}</span>
                        ))}
                        {appliedFilterChips.length > 5 && <span>+{appliedFilterChips.length - 5}</span>}
                    </div>
                </div>
                {filtersOpen && createPortal((
                    <div className={styles.filterSheetLayer}>
                        <button aria-label="Close filters" className={styles.filterSheetBackdrop} type="button" onClick={cancelFilters}/>
                        <aside aria-label="Advanced review filters" aria-modal="true" className={styles.filterSheet} role="dialog">
                            <header className={styles.filterSheetHeader}>
                                <div>
                                    <span><Filter size={14}/> Advanced filters</span>
                                    <h2>Review fields</h2>
                                    <p>{draftDirty ? `${draftFilterCount} selected fields` : "No unapplied changes"}</p>
                                </div>
                                <Button size="icon" type="button" variant="ghost" aria-label="Close filters" onClick={cancelFilters}>
                                    <X size={16}/>
                                </Button>
                            </header>

                            <div className={styles.filterSheetBody}>
                                <nav className={styles.filterSectionNav} aria-label="Filter sections">
                                    {filterSections.map(section => {
                                        const count = countActiveForKeys(draftFilters, sectionFilterKeys[section.key]);
                                        return (
                                            <button
                                                className={cn(styles.filterSectionButton, activeFilterSection === section.key && styles.filterSectionActive)}
                                                key={section.key}
                                                type="button"
                                                onClick={() => setActiveFilterSection(section.key)}
                                            >
                                                <span>{section.label}</span>
                                                {count > 0 && <Badge className={styles.filterCountBadge} variant="outline">{count}</Badge>}
                                            </button>
                                        );
                                    })}
                                </nav>

                                <section className={styles.filterSectionContent}>
                                    <div className={styles.filterSectionHeader}>
                                        <strong>{filterSections.find(section => section.key === activeFilterSection)?.label}</strong>
                                        <span>{countActiveForKeys(draftFilters, sectionFilterKeys[activeFilterSection])} selected</span>
                                    </div>

                                    {activeFilterSection === "common" && (
                                        <div className={styles.quickFilterRow}>
                                            <label className={cn(styles.filterToggle, draftFilters.needs_attention && styles.filterActive)}>
                                                <input
                                                    checked={draftFilters.needs_attention}
                                                    type="checkbox"
                                                    onChange={event => updateFilter("needs_attention", event.target.checked)}
                                                />
                                                <span>Needs attention</span>
                                            </label>
                                        </div>
                                    )}

                                    {activeSelectFilters.length > 0 && (
                                        <FilterGroup title={activeFilterSection === "common" ? "Ordering" : "State"}>
                                            <div className={styles.fieldGrid}>
                                                {activeSelectFilters.map(filter => (
                                                    <label className={styles.filterField} key={filter.key}>
                                                        <span>{filter.label}</span>
                                                        <select
                                                            className={styles.selectInput}
                                                            value={draftFilters[filter.key]}
                                                            onChange={event => updateFilter(filter.key, event.target.value as AdminReviewFilters[typeof filter.key])}
                                                        >
                                                            {filter.options.map(option => (
                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                ))}
                                            </div>
                                        </FilterGroup>
                                    )}

                                    {activeTextFilters.length > 0 && (
                                        <FilterGroup title={activeFilterSection === "common" ? "Search" : "Text and IDs"}>
                                            <div className={styles.fieldGrid}>
                                                {activeTextFilters.map(filter => (
                                                    <label className={styles.filterField} key={filter.key}>
                                                        <span>{filter.label}</span>
                                                        <Input
                                                            placeholder={filter.placeholder}
                                                            value={draftFilters[filter.key] as string}
                                                            onChange={event => updateFilter(filter.key, event.target.value as AdminReviewFilters[typeof filter.key])}
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        </FilterGroup>
                                    )}

                                    {activeRangeFilters.length > 0 && (
                                        <FilterGroup title="Ranges">
                                            <div className={styles.rangeGrid}>
                                                {activeRangeFilters.map(filter => (
                                                    <div className={styles.rangeField} key={filter.label}>
                                                        <span>{filter.label}</span>
                                                        <Input
                                                            aria-label={`${filter.label} minimum`}
                                                            placeholder="Min"
                                                            type={filter.type || "number"}
                                                            value={draftFilters[filter.minKey] as string}
                                                            onChange={event => updateFilter(filter.minKey, event.target.value as AdminReviewFilters[typeof filter.minKey])}
                                                        />
                                                        <Input
                                                            aria-label={`${filter.label} maximum`}
                                                            placeholder="Max"
                                                            type={filter.type || "number"}
                                                            value={draftFilters[filter.maxKey] as string}
                                                            onChange={event => updateFilter(filter.maxKey, event.target.value as AdminReviewFilters[typeof filter.maxKey])}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </FilterGroup>
                                    )}
                                </section>
                            </div>

                            <footer className={styles.filterSheetFooter}>
                                <Button disabled={filtersEqual(draftFilters, defaultReviewFilters)} size="sm" type="button" variant="outline" onClick={resetDraftFilters}>
                                    <RotateCcw size={15}/>
                                    Reset
                                </Button>
                                <Button size="sm" type="button" variant="ghost" onClick={cancelFilters}>
                                    Cancel
                                </Button>
                                <Button disabled={!draftDirty} size="sm" type="button" onClick={applyFilters}>
                                    <CheckCircle2 size={15}/>
                                    Apply filters
                                </Button>
                            </footer>
                        </aside>
                    </div>
                ), document.body)}
            </section>

            {orderedReviews.length > 0 && (
                <section className={styles.selectionBar} aria-label="Review selection">
                    <label className={styles.selectionToggle}>
                        <input
                            checked={allVisibleReviewsSelected}
                            type="checkbox"
                            onChange={toggleVisibleSelection}
                        />
                        <span>{selectedReviewIds.size > 0 ? `${selectedReviewIds.size} selected` : `${orderedReviews.length} visible`}</span>
                    </label>
                    <div className={styles.selectionActions}>
                        <Button size="sm" type="button" variant="outline" onClick={toggleVisibleSelection}>
                            {allVisibleReviewsSelected ? "Unselect visible" : "Select visible"}
                        </Button>
                        {selectedReviewIds.size > 0 && (
                            <Button size="sm" type="button" onClick={openBulkActions}>
                                Bulk action
                            </Button>
                        )}
                        {selectedReviewIds.size > 0 && (
                            <Button size="sm" type="button" variant="ghost" onClick={clearReviewSelection}>
                                Clear
                            </Button>
                        )}
                    </div>
                    {bulkActionMessage && <span className={styles.bulkStatus}>{bulkActionMessage}</span>}
                </section>
            )}

            {bulkActionsOpen && createPortal((
                <div className={styles.filterSheetLayer}>
                    <button aria-label="Close bulk actions" className={styles.filterSheetBackdrop} type="button" onClick={closeBulkActions}/>
                    <aside aria-label="Bulk review actions" aria-modal="true" className={styles.filterSheet} role="dialog">
                        <header className={styles.filterSheetHeader}>
                            <div>
                                <span><CheckCircle2 size={14}/> Bulk actions</span>
                                <h2>Selected reviews</h2>
                                <p>{selectedReviewIds.size} selected</p>
                            </div>
                            <Button disabled={Boolean(bulkPendingAction)} size="icon" type="button" variant="ghost" aria-label="Close bulk actions" onClick={closeBulkActions}>
                                <X size={16}/>
                            </Button>
                        </header>

                        <div className={styles.bulkSheetBody}>
                            <div className={styles.bulkSummary}>
                                <strong>{selectedReviewIds.size} reviews selected</strong>
                                <span>Actions are applied one review at a time using the same moderation endpoint as the review drawer.</span>
                            </div>

                            <FilterGroup title="Decision details">
                                <label className={styles.filterField}>
                                    <span>Reason</span>
                                    <select
                                        className={styles.selectInput}
                                        disabled={bulkReasonOptions.length === 0 || Boolean(bulkPendingAction)}
                                        value={bulkReason}
                                        onChange={event => setBulkReason(event.target.value)}
                                    >
                                        {bulkReasonOptions.length === 0 && <option value="">No active reasons</option>}
                                        {bulkReasonOptions.map(reason => (
                                            <option key={reason.code} value={reason.code}>{reason.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className={styles.filterField}>
                                    <span>Note</span>
                                    <Textarea
                                        className={styles.bulkNote}
                                        disabled={Boolean(bulkPendingAction)}
                                        placeholder="Optional moderation note"
                                        value={bulkNote}
                                        onChange={event => setBulkNote(event.target.value)}
                                    />
                                </label>
                            </FilterGroup>

                            {bulkMessage && <p className={styles.bulkSuccess}>{bulkMessage}</p>}
                            {bulkError && <p className={styles.bulkError}>{bulkError}</p>}
                        </div>

                        <footer className={styles.filterSheetFooter}>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="ghost" onClick={closeBulkActions}>
                                Cancel
                            </Button>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="outline" onClick={() => void runBulkAction("note")}>
                                {bulkPendingAction === "note" ? <LoaderCircle className={styles.spin} size={15}/> : <StickyNote size={15}/>}
                                Save note
                            </Button>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="outline" onClick={() => void runBulkAction("keep")}>
                                {bulkPendingAction === "keep" ? <LoaderCircle className={styles.spin} size={15}/> : <CheckCircle2 size={15}/>}
                                Keep public
                            </Button>
                            <Button disabled={!bulkReason || Boolean(bulkPendingAction)} size="sm" type="button" variant="destructive" onClick={() => void runBulkAction("hide")}>
                                {bulkPendingAction === "hide" ? <LoaderCircle className={styles.spin} size={15}/> : <EyeOff size={15}/>}
                                Hide selected
                            </Button>
                        </footer>
                    </aside>
                </div>
            ), document.body)}

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
                            <strong>{defaultFiltersSelected ? "No reviews need attention" : "No reviews match these filters"}</strong>
                            <span>{defaultFiltersSelected ? "New reports or unreviewed reviews will appear here." : "Change the selected filters or refresh the queue."}</span>
                        </div>
                    </div>
                )}
                {orderedReviews.length > 0 && (
                    <div className={styles.queue}>
                        {orderedReviews.map(review => (
                            <ReviewQueueItem
                                key={review.id}
                                review={review}
                                selectedForBatch={selectedReviewIds.has(review.id)}
                                selected={review.id === selectedId}
                                onOpen={() => openReview(review)}
                                onSelectionChange={checked => toggleReviewSelection(review.id, checked)}
                            />
                        ))}
                    </div>
                )}
            </section>
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

function ReviewQueueItem({
    review,
    selected,
    selectedForBatch,
    onOpen,
    onSelectionChange,
}: {
    review: AdminReview;
    selected: boolean;
    selectedForBatch: boolean;
    onOpen: () => void;
    onSelectionChange: (checked: boolean) => void;
}) {
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
            className={cn(styles.reviewRow, selected && styles.selected, selectedForBatch && styles.batchSelected)}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={onKeyDown}
        >
            <div className={styles.queueReview}>
                <label
                    className={styles.reviewSelector}
                    aria-label={`Select review ${review.id}`}
                    onClick={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                >
                    <input
                        checked={selectedForBatch}
                        type="checkbox"
                        onChange={event => onSelectionChange(event.target.checked)}
                        onClick={event => event.stopPropagation()}
                    />
                </label>
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
                    <BidiParagraph className={styles.queueText}>{review.text}</BidiParagraph>
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

function sortReviews(reviews: AdminReview[], sort: AdminReviewFilters["sort"]) {
    if (sort === "random") return reviews;

    return [...reviews].sort((a, b) => {
        switch (sort) {
        case "oldest":
            return timestamp(a.created_at) - timestamp(b.created_at) || a.id.localeCompare(b.id);
        case "most_reports":
            return openReports(b).length - openReports(a).length || timestamp(b.created_at) - timestamp(a.created_at);
        case "most_signals":
            return b.signals.length - a.signals.length || timestamp(b.created_at) - timestamp(a.created_at);
        default:
            return timestamp(b.created_at) - timestamp(a.created_at) || b.id.localeCompare(a.id);
        }
    });
}

function reviewMatchesFilters(review: AdminReview, filters: AdminReviewFilters) {
    if (filters.needs_attention && !isReviewInDefaultQueue(review)) return false;
    if (!filters.needs_attention) {
        if (filters.deleted === "exclude" && review.deleted_at) return false;
        if (filters.deleted === "only" && !review.deleted_at) return false;
    }

    if (!matchesChoice(filters.visible, review.visible, "visible", "hidden")) return false;
    if (!matchesChoice(filters.reviewed, review.reviewed, "reviewed", "not_reviewed")) return false;
    if (!matchesChoice(filters.positive, review.positive, "recommended", "not_recommended")) return false;
    if (!matchesChoice(filters.student_verified, review.student_verified, "verified", "not_verified")) return false;
    if (!matchesChoice(filters.uaeu_origin, review.uaeu_origin, "uaeu", "non_uaeu")) return false;

    const hasMedia = Boolean(review.attachment || review.gif);
    if (filters.media === "with_media" && !hasMedia) return false;
    if (filters.media === "without_media" && hasMedia) return false;
    if (filters.media === "attachment" && !review.attachment) return false;
    if (filters.media === "gif" && !review.gif) return false;

    const openReportCount = openReports(review).length;
    if (!matchesCountState(filters.open_reports, openReportCount)) return false;
    if (!matchesCountState(filters.signals, review.signals.length)) return false;
    if (!matchesPresence(filters.has_session, review.session_id)) return false;
    if (!matchesPresence(filters.has_user, review.user_id)) return false;
    if (!matchesPresence(filters.has_ip, review.ip_address)) return false;

    if (filters.search && !containsAny(filters.search, [
        review.id,
        review.professor_email,
        review.professor_name,
        review.professor_college,
        review.professor_university,
        review.text,
        review.course_taken,
        review.grade_received,
        review.language,
        review.moderation_reason_code,
        review.moderation_note,
    ])) return false;

    if (!matchesExact(filters.review_id, review.id)) return false;
    if (!containsText(filters.professor_email, review.professor_email)) return false;
    if (!containsText(filters.professor_name, review.professor_name)) return false;
    if (!containsText(filters.professor_college, review.professor_college)) return false;
    if (!containsText(filters.professor_university, review.professor_university)) return false;
    if (!matchesExactText(filters.language, review.language)) return false;
    if (!containsText(filters.course_taken, review.course_taken)) return false;
    if (!containsText(filters.grade_received, review.grade_received)) return false;
    if (!matchesExactText(filters.moderation_reason_code, review.moderation_reason_code)) return false;
    if (!matchesExact(filters.reviewer_user_id, review.reviewer_user_id)) return false;
    if (!matchesExact(filters.session_id, review.session_id)) return false;
    if (!matchesExact(filters.user_id, review.user_id)) return false;
    if (!containsText(filters.ip_address, review.ip_address)) return false;

    if (!matchesNumberRange(review.score, filters.score_min, filters.score_max)) return false;
    if (!matchesNumberRange(review.like_count, filters.like_min, filters.like_max)) return false;
    if (!matchesNumberRange(review.dislike_count, filters.dislike_min, filters.dislike_max)) return false;
    if (!matchesNumberRange(review.reply_count, filters.reply_min, filters.reply_max)) return false;
    if (!matchesDateRange(review.created_at, filters.created_from, filters.created_to)) return false;
    if (!matchesDateRange(review.reviewed_at, filters.reviewed_from, filters.reviewed_to)) return false;

    return true;
}

function isReviewInDefaultQueue(review: AdminReview) {
    if (review.deleted_at) return false;
    if (!review.visible && review.reviewed) return false;
    return !review.reviewed || openReports(review).length > 0;
}

function filtersEqual(a: AdminReviewFilters, b: AdminReviewFilters) {
    return (Object.keys(defaultReviewFilters) as ReviewFilterKey[]).every(key => a[key] === b[key]);
}

function filterChips(filters: AdminReviewFilters) {
    const chips: { key: string; label: string }[] = [];
    if (filters.needs_attention) {
        chips.push({key: "needs_attention", label: "Needs attention"});
    }
    for (const filter of stateFilters) {
        if (filters[filter.key] !== defaultReviewFilters[filter.key]) {
            const selected = filter.options.find(option => option.value === filters[filter.key]);
            chips.push({key: filter.key, label: `${filter.label}: ${selected?.label || filters[filter.key]}`});
        }
    }
    for (const filter of textFilters) {
        const value = filters[filter.key] as string;
        if (value) {
            chips.push({key: filter.key, label: `${filter.label}: ${value}`});
        }
    }
    for (const filter of rangeFilters) {
        const min = filters[filter.minKey] as string;
        const max = filters[filter.maxKey] as string;
        if (min || max) {
            chips.push({key: `${filter.minKey}-${filter.maxKey}`, label: `${filter.label}: ${min || "*"}-${max || "*"}`});
        }
    }
    if (chips.length === 0) {
        chips.push({key: "all-non-deleted", label: "All non-deleted"});
    }
    return chips;
}

function countActiveFilters(filters: AdminReviewFilters) {
    return (Object.keys(defaultReviewFilters) as ReviewFilterKey[]).filter(key => filters[key] !== defaultReviewFilters[key]).length + (filters.needs_attention ? 1 : 0);
}

function countActiveForKeys(filters: AdminReviewFilters, keys: ReviewFilterKey[]) {
    return keys.filter(key => isFilterActive(filters, key)).length;
}

function isFilterActive(filters: AdminReviewFilters, key: ReviewFilterKey) {
    if (key === "needs_attention") return filters.needs_attention;
    return filters[key] !== defaultReviewFilters[key];
}

function matchesChoice(value: string, actual: boolean, trueValue: string, falseValue: string) {
    return value === "any" || value === (actual ? trueValue : falseValue);
}

function matchesCountState(value: string, count: number) {
    return value === "any" || (value === "has" ? count > 0 : count === 0);
}

function matchesPresence(value: string, actual?: string | null) {
    return value === "any" || (value === "has" ? Boolean(actual) : !actual);
}

function containsAny(needle: string, values: unknown[]) {
    return values.some(value => containsText(needle, value));
}

function containsText(needle: string, value: unknown) {
    if (!needle) return true;
    return String(value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function matchesExactText(needle: string, value: unknown) {
    if (!needle) return true;
    return String(value ?? "").toLowerCase() === needle.toLowerCase();
}

function matchesExact(needle: string, value: unknown) {
    if (!needle) return true;
    return String(value ?? "") === needle;
}

function matchesNumberRange(value: number | string, min: string, max: string) {
    const numeric = Number(value);
    const minValue = min === "" ? undefined : Number(min);
    const maxValue = max === "" ? undefined : Number(max);
    if (minValue !== undefined && numeric < minValue) return false;
    if (maxValue !== undefined && numeric > maxValue) return false;
    return true;
}

function matchesDateRange(value: string | undefined, from: string, to: string) {
    if (!from && !to) return true;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return false;
    if (from && timestamp < new Date(from).getTime()) return false;
    if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (timestamp > end.getTime()) return false;
    }
    return true;
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

function timestamp(value?: string) {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function activeReasonOptions(reasons: AdminReason[]) {
    return reasons
        .filter(reason => reason.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

function emitReviewUpdated(review: AdminReview) {
    window.dispatchEvent(new CustomEvent<AdminReview>("admin-review-updated", {detail: review}));
}
