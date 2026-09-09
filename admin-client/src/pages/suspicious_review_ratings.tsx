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
    LoaderCircle,
    MessageSquareText,
    RefreshCw,
    RotateCcw,
    Search,
    SlidersHorizontal,
    ThumbsDown,
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
    type AdminReviewRating,
    type AdminSuspiciousReviewRatingFilters,
    type AdminSuspiciousReviewRatingPair,
    type AdminSuspiciousReviewRatingReview,
    listAdminSuspiciousReviewRatingPairs,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./suspicious_reviews.module.scss";

type LoadState = "loading" | "ready" | "error";
type BadgeTone = "default" | "warning" | "danger" | "info" | "success" | "outline";
type GroupSort = "recency" | "score" | "group_size";

type SuspiciousRatingGroup = {
    key: string;
    pairs: AdminSuspiciousReviewRatingPair[];
    review: AdminSuspiciousReviewRatingReview;
    ratings: AdminReviewRating[];
    suspicionScore: number;
    createdSpanSeconds: number;
};

const defaultFilters: AdminSuspiciousReviewRatingFilters = {
    min_score: "5",
    value: "any",
    visible: "visible",
    search: "",
    review_id: "",
    professor_email: "",
};

const valueOptions: { label: string; value: AdminSuspiciousReviewRatingFilters["value"] }[] = [
    {label: "All votes", value: "any"},
    {label: "Likes only", value: "like"},
    {label: "Dislikes only", value: "dislike"},
    {label: "Mixed votes", value: "mixed"},
];

const visibleOptions: { label: string; value: AdminSuspiciousReviewRatingFilters["visible"] }[] = [
    {label: "Visible reviews", value: "visible"},
    {label: "Hidden reviews", value: "hidden"},
    {label: "All reviews", value: "any"},
];

const groupSortOptions: { label: string; value: GroupSort }[] = [
    {label: "Most recent", value: "recency"},
    {label: "Highest score", value: "score"},
    {label: "Largest group", value: "group_size"},
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

export function SuspiciousReviewRatingsPage() {
    const [pairs, setPairs] = useState<AdminSuspiciousReviewRatingPair[]>([]);
    const [filters, setFilters] = useState<AdminSuspiciousReviewRatingFilters>(defaultFilters);
    const [draftFilters, setDraftFilters] = useState<AdminSuspiciousReviewRatingFilters>(defaultFilters);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [groupSort, setGroupSort] = useState<GroupSort>("recency");
    const {openEntity, showSensitive, toggleSensitive} = useAdminEntityDrawer();

    const loadPairs = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        listAdminSuspiciousReviewRatingPairs(controller.signal, filters)
            .then(response => {
                setPairs(response.pairs);
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                setError(err instanceof AdminApiError ? err.message : "Could not load suspicious ratings.");
            })
            .finally(() => setIsRefreshing(false));

        return () => controller.abort();
    }, [filters]);

    useEffect(() => loadPairs("initial"), [loadPairs]);

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

    function updateDraft<K extends keyof AdminSuspiciousReviewRatingFilters>(
        key: K,
        value: AdminSuspiciousReviewRatingFilters[K],
    ) {
        setDraftFilters(current => ({...current, [key]: value}));
    }

    function applyFilters(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const nextFilters = normalizeRatingFilters(draftFilters);
        setDraftFilters(nextFilters);
        setFilters(nextFilters);
        setFiltersOpen(false);
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
    }

    const groupedRatings = useMemo(() => groupSuspiciousRatingPairs(pairs), [pairs]);
    const groups = useMemo(() => sortSuspiciousRatingGroups(groupedRatings, groupSort), [groupedRatings, groupSort]);
    const totalSignals = useMemo(
        () => groups.reduce((sum, group) => sum + groupSignals(group, showSensitive).length, 0),
        [groups, showSensitive],
    );
    const linkedRatingCount = useMemo(
        () => groups.reduce((sum, group) => sum + group.ratings.length, 0),
        [groups],
    );
    const activeFilterCount = countActiveFilters(filters);
    const draftFilterCount = countActiveFilters(draftFilters);
    const appliedFilterChips = useMemo(() => filterChips(filters), [filters]);
    const draftDirty = !filtersEqual(draftFilters, filters);
    const defaultFiltersSelected = filtersEqual(filters, defaultFilters);
    const defaultDraftSelected = filtersEqual(draftFilters, defaultFilters);

    return (
        <div className={styles.page}>
            <div className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Review ratings</p>
                    <h1 className={styles.title}>Suspicious ratings</h1>
                </div>
                <div className={styles.introActions}>
                    <span className={styles.previewNote}>Up to 100 pair matches</span>
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

            <section className={styles.summaryStrip} aria-label="Suspicious rating summary">
                <SummaryStat icon={<UserRound size={16}/>} label="Linked groups" value={groups.length}/>
                <SummaryStat icon={<Gauge size={16}/>} label="Linked ratings" value={linkedRatingCount}/>
                <SummaryStat icon={<AlertCircle size={16}/>} label="Signals" value={totalSignals}/>
            </section>

            <section className={styles.filters} aria-label="Suspicious rating filters">
                <form className={styles.filterToolbar} onSubmit={applyFilters}>
                    <label className={styles.filterSearch}>
                        <Search size={16}/>
                        <Input
                            aria-label="Search suspicious ratings"
                            placeholder="Search professor, review ID, or text"
                            value={draftFilters.search}
                            onChange={event => updateDraft("search", event.target.value)}
                        />
                    </label>
                    <div className={cn(styles.quickFilters, styles.ratingQuickFilters)}>
                        <label className={styles.compactFilterField}>
                            <span>Min score</span>
                            <Input
                                aria-label="Minimum score"
                                min="0"
                                max="16"
                                type="number"
                                value={draftFilters.min_score}
                                onChange={event => updateDraft("min_score", event.target.value)}
                            />
                        </label>
                        <label className={styles.compactFilterField}>
                            <span>Vote</span>
                            <select
                                className={styles.selectInput}
                                value={draftFilters.value}
                                onChange={event => updateDraft("value", event.target.value as AdminSuspiciousReviewRatingFilters["value"])}
                            >
                                {valueOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.compactFilterField}>
                            <span>Review</span>
                            <select
                                className={styles.selectInput}
                                value={draftFilters.visible}
                                onChange={event => updateDraft("visible", event.target.value as AdminSuspiciousReviewRatingFilters["visible"])}
                            >
                                {visibleOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.compactFilterField}>
                            <span>Sort</span>
                            <select
                                aria-label="Sort suspicious rating groups"
                                className={styles.selectInput}
                                value={groupSort}
                                onChange={event => setGroupSort(event.target.value as GroupSort)}
                            >
                                {groupSortOptions.map(option => (
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
                        <aside aria-label="Suspicious rating filters" aria-modal="true" className={styles.filterSheet} role="dialog">
                            <header className={styles.filterSheetHeader}>
                                <div>
                                    <span><Filter size={14}/> Filters</span>
                                    <h2>Suspicious rating fields</h2>
                                    <p>{draftDirty ? `${draftFilterCount} changed fields` : "No unapplied changes"}</p>
                                </div>
                                <Button size="icon" type="button" variant="ghost" aria-label="Close filters" onClick={cancelFilters}>
                                    <X size={16}/>
                                </Button>
                            </header>

                            <div className={styles.filterSheetBody}>
                                <FilterGroup title="Find linked ratings">
                                    <label className={styles.filterField}>
                                        <span>Search</span>
                                        <Input
                                            placeholder="Professor, review ID, or text"
                                            value={draftFilters.search}
                                            onChange={event => updateDraft("search", event.target.value)}
                                        />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Review ID</span>
                                        <Input
                                            inputMode="numeric"
                                            placeholder="Exact review ID"
                                            value={draftFilters.review_id}
                                            onChange={event => updateDraft("review_id", event.target.value.replace(/\D/g, ""))}
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
                                </FilterGroup>

                                <FilterGroup title="Threshold and vote">
                                    <div className={styles.rangePair}>
                                        <label className={styles.filterField}>
                                            <span>Minimum score</span>
                                            <Input
                                                min="0"
                                                max="16"
                                                type="number"
                                                value={draftFilters.min_score}
                                                onChange={event => updateDraft("min_score", event.target.value)}
                                            />
                                        </label>
                                        <label className={styles.filterField}>
                                            <span>Vote pattern</span>
                                            <select
                                                className={styles.selectInput}
                                                value={draftFilters.value}
                                                onChange={event => updateDraft("value", event.target.value as AdminSuspiciousReviewRatingFilters["value"])}
                                            >
                                                {valueOptions.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                </FilterGroup>

                                <FilterGroup title="Parent review visibility">
                                    <label className={styles.filterField}>
                                        <span>Reviews</span>
                                        <select
                                            className={styles.selectInput}
                                            value={draftFilters.visible}
                                            onChange={event => updateDraft("visible", event.target.value as AdminSuspiciousReviewRatingFilters["visible"])}
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

            <section className={cn(styles.feed, isRefreshing && styles.refreshingFeed)}>
                {loadState === "loading" && pairs.length === 0 && <SkeletonList/>}
                {loadState === "error" && pairs.length === 0 && (
                    <div className={cn(styles.stateNotice, styles.errorNotice)}>
                        <AlertCircle size={20}/>
                        <div>
                            <strong>Suspicious ratings could not be loaded</strong>
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
                            <strong>No linked ratings found</strong>
                            <span>No review currently has multiple ratings linked by the selected identity signals.</span>
                        </div>
                    </div>
                )}
                {groups.length > 0 && (
                    <div className={styles.pairList}>
                        {groups.map(group => (
                            <SuspiciousRatingGroupRow
                                key={group.key}
                                group={group}
                                showSensitive={showSensitive}
                                onOpenReview={() => openEntity({type: "review", id: group.review.id})}
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

function SuspiciousRatingGroupRow({
    group,
    showSensitive,
    onOpenReview,
}: {
    group: SuspiciousRatingGroup;
    showSensitive: boolean;
    onOpenReview: () => void;
}) {
    const review = group.review;
    const signals = groupSignals(group, showSensitive);
    const likeCount = group.ratings.filter(rating => rating.value === "like").length;
    const dislikeCount = group.ratings.length - likeCount;

    return (
        <article className={styles.pairRow}>
            <header className={styles.pairHeader}>
                <div className={styles.pairTitle}>
                    <Badge className={styles.scoreBadge} variant={scoreTone(group.suspicionScore)}>
                        Score {group.suspicionScore}
                    </Badge>
                    <div>
                        <strong>{review.professor_name}</strong>
                        <span>{review.professor_email} · Review #{review.id}</span>
                    </div>
                </div>
                <div className={styles.pairMeta}>
                    <Badge variant="danger">{group.ratings.length} linked ratings</Badge>
                    <Badge variant="success"><ThumbsUp size={12}/> {likeCount}</Badge>
                    <Badge variant={dislikeCount > 0 ? "warning" : "outline"}><ThumbsDown size={12}/> {dislikeCount}</Badge>
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

            <article className={styles.reviewCard}>
                <div className={styles.reviewCardHead}>
                    <div>
                        <span>Target review</span>
                        <strong><EntityLink target={{type: "review", id: review.id}}>#{review.id}</EntityLink></strong>
                    </div>
                    <div className={styles.reviewCardActions}>
                        <Button size="sm" type="button" variant="outline" onClick={onOpenReview}>
                            <MessageSquareText size={15}/>
                            Open
                        </Button>
                    </div>
                </div>
                <BidiParagraph className={styles.reviewText}>{review.text}</BidiParagraph>
                <div className={styles.reviewBadges}>
                    <Badge variant={review.visible ? "success" : "danger"}>{review.visible ? "Visible" : "Hidden"}</Badge>
                    <Badge variant={review.positive ? "success" : "danger"}>{review.score}/5</Badge>
                    <Badge variant="outline"><ThumbsUp size={12}/> {review.like_count}</Badge>
                    <Badge variant="outline"><ThumbsDown size={12}/> {review.dislike_count}</Badge>
                </div>
                <div className={styles.reviewMeta}>
                    <span>{formatDateTime(review.created_at)}</span>
                    <EntityLink target={{type: "review", id: review.id}}>Review {review.id}</EntityLink>
                </div>
            </article>

            <div className={styles.reviewGrid}>
                {group.ratings.map((rating, index) => (
                    <RatingCard
                        key={ratingKey(rating)}
                        isLatest={index === 0}
                        label={index === 0 ? "Latest rating" : `Earlier rating ${index}`}
                        rating={rating}
                        showSensitive={showSensitive}
                    />
                ))}
            </div>
        </article>
    );
}

function RatingCard({
    isLatest,
    label,
    rating,
    showSensitive,
}: {
    isLatest: boolean;
    label: string;
    rating: AdminReviewRating;
    showSensitive: boolean;
}) {
    const hasDeviceDetails = Boolean(rating.user_agent || rating.thumbmark_fingerprint || rating.creep_fingerprint);

    return (
        <article className={styles.reviewCard}>
            <div className={styles.reviewCardHead}>
                <div>
                    <span>{label}</span>
                    <strong>{rating.value === "like" ? "Like" : "Dislike"}</strong>
                </div>
                {rating.value === "like" ? <ThumbsUp size={18}/> : <ThumbsDown size={18}/>}
            </div>
            <div className={styles.reviewBadges}>
                {isLatest && <Badge variant="info">Latest</Badge>}
                <Badge variant={rating.value === "like" ? "success" : "danger"}>
                    {rating.value === "like" ? "Like" : "Dislike"}
                </Badge>
            </div>
            <div className={styles.reviewMeta}>
                <span>{formatDateTime(rating.created_at)}</span>
                <EntityLink target={{type: "session", id: rating.session_id}}>Session {rating.session_id}</EntityLink>
                {rating.user_id && <EntityLink target={{type: "user", id: rating.user_id}}>User {rating.user_id}</EntityLink>}
                <EntityLink target={{type: "ip", id: rating.ip_address}}>{maskIpAddress(rating.ip_address, showSensitive)}</EntityLink>
            </div>
            {hasDeviceDetails && (
                <div className={styles.reviewMeta}>
                    {rating.user_agent && <span>Agent {maskUserAgent(rating.user_agent, showSensitive)}</span>}
                    {rating.thumbmark_fingerprint && <span>Thumbmark {maskFingerprint(rating.thumbmark_fingerprint, showSensitive)}</span>}
                    {rating.creep_fingerprint && <span>Creep {maskFingerprint(rating.creep_fingerprint, showSensitive)}</span>}
                </div>
            )}
        </article>
    );
}

function SkeletonList() {
    return (
        <div aria-label="Loading suspicious ratings">
            {[0, 1, 2].map(index => (
                <div className={styles.skeletonRow} key={index}>
                    <span/>
                    <span/>
                    <span/>
                </div>
            ))}
        </div>
    );
}

function groupSuspiciousRatingPairs(pairs: AdminSuspiciousReviewRatingPair[]): SuspiciousRatingGroup[] {
    const parents = new Map<string, string>();
    const ratingsByKey = new Map<string, AdminReviewRating>();

    for (const pair of pairs) {
        const firstKey = ratingKey(pair.rating_1);
        const secondKey = ratingKey(pair.rating_2);
        parents.set(firstKey, firstKey);
        parents.set(secondKey, secondKey);
        ratingsByKey.set(firstKey, pair.rating_1);
        ratingsByKey.set(secondKey, pair.rating_2);
    }

    function find(key: string): string {
        const parent = parents.get(key) || key;
        if (parent !== key) {
            const root = find(parent);
            parents.set(key, root);
            return root;
        }
        return parent;
    }

    function union(firstKey: string, secondKey: string) {
        const firstRoot = find(firstKey);
        const secondRoot = find(secondKey);
        if (firstRoot !== secondRoot) {
            parents.set(secondRoot, firstRoot);
        }
    }

    pairs.forEach(pair => union(ratingKey(pair.rating_1), ratingKey(pair.rating_2)));

    const pairsByRoot = new Map<string, AdminSuspiciousReviewRatingPair[]>();
    for (const pair of pairs) {
        const root = find(ratingKey(pair.rating_1));
        const groupPairs = pairsByRoot.get(root) || [];
        groupPairs.push(pair);
        pairsByRoot.set(root, groupPairs);
    }

    return [...pairsByRoot.values()].map(groupPairs => {
        const ratingKeys = new Set<string>();
        for (const pair of groupPairs) {
            ratingKeys.add(ratingKey(pair.rating_1));
            ratingKeys.add(ratingKey(pair.rating_2));
        }
        const ratings = [...ratingKeys]
            .map(key => ratingsByKey.get(key))
            .filter((rating): rating is AdminReviewRating => Boolean(rating))
            .sort(compareRatingsNewestFirst);
        const newestTimestamp = Date.parse(ratings[0]?.created_at || "");
        const oldestTimestamp = Date.parse(ratings[ratings.length - 1]?.created_at || "");
        const review = groupPairs[0].review;

        return {
            key: `${review.id}:${[...ratingKeys].sort().join("|")}`,
            pairs: groupPairs,
            review,
            ratings,
            suspicionScore: Math.max(...groupPairs.map(pair => pair.suspicion_score)),
            createdSpanSeconds: Number.isFinite(newestTimestamp) && Number.isFinite(oldestTimestamp)
                ? Math.max(0, Math.round((newestTimestamp - oldestTimestamp) / 1000))
                : 0,
        };
    }).sort((first, second) => compareRatingsNewestFirst(first.ratings[0], second.ratings[0]));
}

function ratingKey(rating: AdminReviewRating) {
    return `${rating.review_id}:${rating.session_id}`;
}

function compareRatingsNewestFirst(first?: AdminReviewRating, second?: AdminReviewRating) {
    const timeDifference = Date.parse(second?.created_at || "") - Date.parse(first?.created_at || "");
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    return (second?.session_id || "").localeCompare(first?.session_id || "", undefined, {numeric: true});
}

function sortSuspiciousRatingGroups(groups: SuspiciousRatingGroup[], sort: GroupSort) {
    return [...groups].sort((first, second) => {
        if (sort === "score") {
            const scoreDifference = second.suspicionScore - first.suspicionScore;
            if (scoreDifference !== 0) return scoreDifference;
        }
        if (sort === "group_size") {
            const sizeDifference = second.ratings.length - first.ratings.length;
            if (sizeDifference !== 0) return sizeDifference;
        }

        const recencyDifference = compareRatingsNewestFirst(first.ratings[0], second.ratings[0]);
        if (recencyDifference !== 0) return recencyDifference;
        return first.key.localeCompare(second.key, undefined, {numeric: true});
    });
}

function groupSignals(group: SuspiciousRatingGroup, showSensitive: boolean) {
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

function pairSignals(pair: AdminSuspiciousReviewRatingPair, showSensitive: boolean) {
    const signals: {
        key: string;
        label: string;
        weight: number;
        tone: BadgeTone;
        icon: ReactNode;
        detail?: ReactNode;
    }[] = [];

    if (pair.same_thumbmark) {
        signals.push({
            key: "same_thumbmark",
            label: "Same thumbmark",
            weight: 5,
            tone: "danger",
            icon: <Fingerprint size={13}/>,
            detail: pair.rating_1.thumbmark_fingerprint
                ? maskFingerprint(pair.rating_1.thumbmark_fingerprint, showSensitive)
                : undefined,
        });
    }
    if (pair.same_creep) {
        signals.push({
            key: "same_creep",
            label: "Same creep",
            weight: 5,
            tone: "danger",
            icon: <Fingerprint size={13}/>,
            detail: pair.rating_1.creep_fingerprint
                ? maskFingerprint(pair.rating_1.creep_fingerprint, showSensitive)
                : undefined,
        });
    }
    if (pair.same_ip) {
        signals.push({
            key: "same_ip",
            label: "Same IP",
            weight: 2,
            tone: "danger",
            icon: <Wifi size={13}/>,
            detail: (
                <EntityLink target={{type: "ip", id: pair.rating_1.ip_address}}>
                    {maskIpAddress(pair.rating_1.ip_address, showSensitive)}
                </EntityLink>
            ),
        });
    }
    if (pair.same_user_agent) {
        signals.push({
            key: "same_user_agent",
            label: "Same agent",
            weight: 1,
            tone: "warning",
            icon: <Fingerprint size={13}/>,
            detail: pair.rating_1.user_agent ? maskUserAgent(pair.rating_1.user_agent, showSensitive) : undefined,
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
    if (pair.same_value) {
        signals.push({
            key: "same_value",
            label: "Same vote",
            weight: 1,
            tone: "info",
            icon: pair.rating_1.value === "like" ? <ThumbsUp size={13}/> : <ThumbsDown size={13}/>,
            detail: pair.rating_1.value === "like" ? "Like" : "Dislike",
        });
    }

    return signals;
}

function scoreTone(score: number): BadgeTone {
    if (score >= 9) return "danger";
    if (score >= 6) return "warning";
    return "info";
}

function normalizeRatingFilters(filters: AdminSuspiciousReviewRatingFilters): AdminSuspiciousReviewRatingFilters {
    const rawScore = filters.min_score.trim();
    const parsedScore = rawScore === "" ? 0 : Number(rawScore);
    const minScore = Number.isFinite(parsedScore)
        ? Math.min(16, Math.max(0, Math.trunc(parsedScore)))
        : Number(defaultFilters.min_score);
    const reviewID = filters.review_id.trim();

    return {
        ...filters,
        min_score: String(minScore),
        search: filters.search.trim(),
        review_id: /^\d+$/.test(reviewID) ? reviewID : "",
        professor_email: filters.professor_email.trim(),
    };
}

function countActiveFilters(filters: AdminSuspiciousReviewRatingFilters) {
    return (Object.keys(defaultFilters) as Array<keyof AdminSuspiciousReviewRatingFilters>)
        .filter(key => filters[key] !== defaultFilters[key])
        .length;
}

function filtersEqual(a: AdminSuspiciousReviewRatingFilters, b: AdminSuspiciousReviewRatingFilters) {
    return (Object.keys(defaultFilters) as Array<keyof AdminSuspiciousReviewRatingFilters>)
        .every(key => a[key] === b[key]);
}

function filterChips(filters: AdminSuspiciousReviewRatingFilters) {
    const chips: { key: string; label: string }[] = [];
    if (filters.search.trim()) {
        chips.push({key: "search", label: `Search: ${filters.search.trim()}`});
    }
    if (filters.review_id.trim()) {
        chips.push({key: "review_id", label: `Review: ${filters.review_id.trim()}`});
    }
    if (filters.professor_email.trim()) {
        chips.push({key: "professor_email", label: `Email: ${filters.professor_email.trim()}`});
    }
    if (filters.min_score !== defaultFilters.min_score) {
        chips.push({key: "min_score", label: `Score ${filters.min_score || "0"}+`});
    }
    if (filters.value !== defaultFilters.value) {
        const selected = valueOptions.find(option => option.value === filters.value);
        chips.push({key: "value", label: selected?.label || filters.value});
    }
    if (filters.visible !== defaultFilters.visible) {
        const selected = visibleOptions.find(option => option.value === filters.visible);
        chips.push({key: "visible", label: selected?.label || filters.visible});
    }
    return chips;
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
