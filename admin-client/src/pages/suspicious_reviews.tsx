import {type FormEvent, useEffect, useMemo, useState} from "react";
import {
    AlertCircle,
    EyeOff,
    Fingerprint,
    Gauge,
    Languages,
    LoaderCircle,
    MessageSquareText,
    Star,
    ThumbsUp,
    Timer,
    UserRound,
    Wifi,
} from "lucide-react";
import {BidiParagraph} from "@/components/admin/bidi_text";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {
    FilterGroup,
    FilterInput,
    FilterSelect,
    type GroupSort,
    type IdentitySignal,
    type LinkedGroup,
    QueueFeed,
    SignalBadges,
    SpamReasonTag,
    SummaryStrip,
    SuspiciousFilters,
    SuspiciousPageHeader,
    compareNewestFirst,
    formatDateTime,
    formatDuration,
    linkPairs,
    maskFingerprint,
    maskIpAddress,
    maskUserAgent,
    mergeSignals,
    optionChip,
    scoreTone,
    sortLinkedGroups,
    suspiciousStyles as styles,
    textChip,
    useDraftFilters,
    useSuspiciousPairs,
} from "@/components/admin/suspicious_queue";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    AdminApiError,
    type AdminReview,
    type AdminSuspiciousReviewFilters,
    type AdminSuspiciousReviewPair,
    hideSuspiciousReviewPairs,
    listAdminSuspiciousReviewPairs,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";

type ReviewGroup = LinkedGroup<AdminSuspiciousReviewPair, AdminReview> & { contentSimilarity: number };

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

const newestReviewFirst = compareNewestFirst<AdminReview>(review => review.id);

export function SuspiciousReviewsPage() {
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
    const [keptReviewIds, setKeptReviewIds] = useState<Record<string, string>>({});
    const [groupSort, setGroupSort] = useState<GroupSort>("recency");
    const [bulkNote, setBulkNote] = useState("");
    const [bulkPending, setBulkPending] = useState(false);
    const [bulkMessage, setBulkMessage] = useState("");
    const [bulkError, setBulkError] = useState("");
    const {openEntity, showSensitive, toggleSensitive} = useAdminEntityDrawer();

    const filterState = useDraftFilters(defaultFilters, {onApplied: () => setSelectedGroupKeys(new Set())});
    const {pairs, setPairs, loadState, error, isRefreshing, reload} = useSuspiciousPairs(
        listAdminSuspiciousReviewPairs,
        filterState.filters,
        "Could not load suspicious reviews.",
    );

    const groups = useMemo(
        () => sortLinkedGroups(groupReviewPairs(pairs), groupSort, newestReviewFirst) as ReviewGroup[],
        [pairs, groupSort],
    );
    const signalCount = useMemo(() => groups.reduce((sum, group) => sum + groupSignals(group, showSensitive).length, 0), [groups, showSensitive]);
    const extraReviewCount = useMemo(() => groups.reduce((sum, group) => sum + Math.max(0, group.items.length - 1), 0), [groups]);
    const groupKeys = useMemo(() => groups.map(group => group.key), [groups]);
    const selectedCount = groupKeys.filter(key => selectedGroupKeys.has(key)).length;
    const allSelected = groupKeys.length > 0 && selectedCount === groupKeys.length;

    // Drop selections and kept choices for groups that are no longer loaded.
    useEffect(() => {
        const loaded = new Set(groupKeys);
        setSelectedGroupKeys(current => {
            const next = new Set([...current].filter(key => loaded.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [groupKeys]);

    useEffect(() => {
        setKeptReviewIds(current => {
            const next: Record<string, string> = {};
            groups.forEach(group => {
                const currentId = current[group.key];
                next[group.key] = group.items.some(review => review.id === currentId) ? currentId : group.items[0]?.id;
            });
            return recordsEqual(current, next) ? current : next;
        });
    }, [groups]);

    function keptReviewId(group: ReviewGroup) {
        return keptReviewIds[group.key] || group.items[0].id;
    }

    function applyDecisions(updates: { review_1: AdminReview; review_2: AdminReview }[]) {
        const byId = new Map(updates.flatMap(pair => [[pair.review_1.id, pair.review_1], [pair.review_2.id, pair.review_2]] as const));
        setPairs(current => current.map(pair => ({
            ...pair,
            review_1: byId.get(pair.review_1.id) || pair.review_1,
            review_2: byId.get(pair.review_2.id) || pair.review_2,
        })));
    }

    function changeSelection(update: (current: Set<string>) => Set<string>) {
        setBulkMessage("");
        setBulkError("");
        setSelectedGroupKeys(current => update(new Set(current)));
    }

    async function hideSelected(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const targets = groups.filter(group => selectedGroupKeys.has(group.key));
        if (targets.length === 0) return;

        setBulkPending(true);
        setBulkMessage("");
        setBulkError("");
        try {
            const response = await hideSuspiciousReviewPairs({
                pairs: targets.flatMap(group => group.pairs).map(pair => ({review_1_id: pair.review_1.id, review_2_id: pair.review_2.id})),
                keep_reviews: targets.map(group => ({review_id: keptReviewId(group)})),
                note: bulkNote.trim() || undefined,
                resolve_reports: true,
            });
            applyDecisions(response.pairs);
            setSelectedGroupKeys(new Set());
            const hidden = targets.reduce((sum, group) => sum + reviewsToHide(group, keptReviewId(group)), 0);
            setBulkMessage(bulkSuccessMessage(targets.length, hidden, response.resolved_report_count));
        } catch (err: unknown) {
            setBulkError(err instanceof AdminApiError ? err.message : "Older reviews could not be hidden.");
        } finally {
            setBulkPending(false);
        }
    }

    return (
        <div className={styles.page}>
            <SuspiciousPageHeader
                eyebrow="Reviews"
                title="Suspicious reviews"
                isRefreshing={isRefreshing}
                onRefresh={() => reload("refresh")}
                showSensitive={showSensitive}
                onToggleSensitive={toggleSensitive}
            />

            <SummaryStrip
                label="Suspicious review summary"
                stats={[
                    {icon: <UserRound size={16}/>, label: "Repeat groups", value: groups.length},
                    {icon: <Gauge size={16}/>, label: "Older reviews", value: extraReviewCount},
                    {icon: <AlertCircle size={16}/>, label: "Signals", value: signalCount},
                ]}
            />

            <SuspiciousFilters
                state={filterState}
                label="Suspicious reviews"
                searchPlaceholder="Search professor, review ID, or text"
                groupSort={groupSort}
                onGroupSortChange={setGroupSort}
                quickFields={(
                    <>
                        <FilterInput state={filterState} field="min_score" label="Min score" compact type="number" min="0" max="31"/>
                        <FilterSelect state={filterState} field="visible" label="Visibility" compact options={visibleOptions}/>
                    </>
                )}
                sheetHeading="Suspicious review fields"
                sheetFields={(
                    <>
                        <FilterGroup title="Find repeated reviewers">
                            <FilterInput state={filterState} field="search" label="Search" placeholder="Professor, review ID, or text"/>
                            <FilterInput state={filterState} field="professor_email" label="Professor email" placeholder="name@uaeu.ac.ae"/>
                            <label className={cn(styles.filterToggle, filterState.draft.include_content_only === "true" && styles.filterActive)}>
                                <input
                                    checked={filterState.draft.include_content_only === "true"}
                                    type="checkbox"
                                    onChange={event => filterState.update("include_content_only", event.target.checked ? "true" : "false")}
                                />
                                <span>Content-only matches</span>
                            </label>
                        </FilterGroup>
                        <FilterGroup title="Thresholds">
                            <div className={styles.rangePair}>
                                <FilterInput state={filterState} field="min_score" label="Minimum score" type="number" min="0" max="31"/>
                                <FilterInput state={filterState} field="similarity_threshold" label="Similarity" type="number" min="0.3" max="1" step="0.05"/>
                            </div>
                        </FilterGroup>
                        <FilterGroup title="Visibility">
                            <FilterSelect state={filterState} field="visible" label="Visible reviews" options={visibleOptions}/>
                        </FilterGroup>
                    </>
                )}
                chips={filterChips(filterState.filters)}
            />

            {groups.length > 0 && (
                <form className={styles.bulkBar} onSubmit={hideSelected}>
                    <label className={styles.selectionToggle}>
                        <input
                            checked={allSelected}
                            type="checkbox"
                            onChange={() => changeSelection(next => {
                                groupKeys.forEach(key => (allSelected ? next.delete(key) : next.add(key)));
                                return next;
                            })}
                        />
                        <span>{selectedCount} of {groupKeys.length} groups selected</span>
                    </label>
                    <div className={styles.bulkField}>
                        <span>Reason</span>
                        <SpamReasonTag/>
                    </div>
                    <label className={cn(styles.bulkField, styles.bulkNote)}>
                        <span>Internal note</span>
                        <Input disabled={bulkPending} placeholder="Optional" value={bulkNote} onChange={event => setBulkNote(event.target.value)}/>
                    </label>
                    <div className={styles.bulkActions}>
                        <Button disabled={selectedCount === 0 || bulkPending} type="button" variant="outline" onClick={() => changeSelection(() => new Set())}>
                            Clear
                        </Button>
                        <Button disabled={selectedCount === 0 || bulkPending} type="submit" variant="destructive">
                            {bulkPending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                            Keep chosen in selected
                        </Button>
                    </div>
                    {bulkMessage && <p className={styles.actionStatus}>{bulkMessage}</p>}
                    {bulkError && <p className={styles.actionError}>{bulkError}</p>}
                </form>
            )}

            <QueueFeed
                loadState={loadState}
                isRefreshing={isRefreshing}
                hasPairs={pairs.length > 0}
                hasGroups={groups.length > 0}
                error={error}
                errorTitle="Suspicious reviews could not be loaded"
                emptyTitle="No repeated reviewers found"
                emptyText="Each visible reviewer currently has at most one matched review per professor."
                onRetry={() => reload("initial")}
            >
                {groups.map(group => (
                    <ReviewGroupRow
                        key={group.key}
                        group={group}
                        keptReviewId={keptReviewId(group)}
                        selected={selectedGroupKeys.has(group.key)}
                        showSensitive={showSensitive}
                        onDecided={applyDecisions}
                        onKeptReviewChange={reviewId => setKeptReviewIds(current => ({...current, [group.key]: reviewId}))}
                        onSelectionChange={checked => changeSelection(next => {
                            if (checked) next.add(group.key); else next.delete(group.key);
                            return next;
                        })}
                        onOpenReview={review => openEntity({type: "review", id: review.id})}
                    />
                ))}
            </QueueFeed>
        </div>
    );
}

function ReviewGroupRow({group, keptReviewId, selected, showSensitive, onDecided, onKeptReviewChange, onSelectionChange, onOpenReview}: {
    group: ReviewGroup;
    keptReviewId: string;
    selected: boolean;
    showSensitive: boolean;
    onDecided: (pairs: { review_1: AdminReview; review_2: AdminReview }[]) => void;
    onKeptReviewChange: (reviewId: string) => void;
    onSelectionChange: (checked: boolean) => void;
    onOpenReview: (review: AdminReview) => void;
}) {
    const latest = group.items[0];
    const kept = group.items.find(review => review.id === keptReviewId) || latest;
    const hideCount = reviewsToHide(group, kept.id);
    const [note, setNote] = useState("");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function hideOthers(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setError("");
        setMessage("");
        try {
            const response = await hideSuspiciousReviewPairs({
                pairs: group.pairs.map(pair => ({review_1_id: pair.review_1.id, review_2_id: pair.review_2.id})),
                keep_reviews: [{review_id: kept.id}],
                note: note.trim() || undefined,
                resolve_reports: true,
            });
            onDecided(response.pairs);
            const base = `${hideCount} ${pluralizeReview(hideCount)} hidden. Review #${kept.id} kept.`;
            setMessage(response.resolved_report_count > 0 ? `${base} ${response.resolved_report_count} reports resolved.` : base);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not hide older reviews.");
        } finally {
            setPending(false);
        }
    }

    return (
        <article className={cn(styles.pairRow, selected && styles.pairSelected)}>
            <header className={styles.pairHeader}>
                <div className={styles.pairTitle}>
                    <label className={styles.pairSelector} aria-label={`Select ${group.items.length} matched reviews for ${latest.professor_name}`}>
                        <input checked={selected} type="checkbox" onChange={event => onSelectionChange(event.target.checked)}/>
                    </label>
                    <Badge className={styles.scoreBadge} variant={scoreTone(group.suspicionScore)}>Score {group.suspicionScore}</Badge>
                    <div>
                        <strong>{latest.professor_name}</strong>
                        <span>{latest.professor_email}</span>
                    </div>
                </div>
                <div className={styles.pairMeta}>
                    <Badge variant="danger">{group.items.length} reviews from one matched reviewer</Badge>
                    <Badge variant="info">Up to {formatPercent(group.contentSimilarity)} text match</Badge>
                    <Badge variant="outline">{formatDuration(group.createdSpanSeconds)} span</Badge>
                </div>
            </header>

            <SignalBadges signals={groupSignals(group, showSensitive)}/>

            <div className={styles.reviewGrid}>
                {group.items.map((review, index) => (
                    <ReviewCard
                        key={review.id}
                        isLatest={index === 0}
                        isKept={kept.id === review.id}
                        keepChoiceName={`keep-review-${group.key}`}
                        label={index === 0 ? "Latest review" : `Older review ${index}`}
                        review={review}
                        showSensitive={showSensitive}
                        onKeep={() => onKeptReviewChange(review.id)}
                        onOpen={() => onOpenReview(review)}
                    />
                ))}
            </div>

            <form className={styles.pairAction} onSubmit={hideOthers}>
                <p className={styles.actionExplainer}>
                    Review #{kept.id} is selected to remain unchanged. {hideCount} other visible {pluralizeReview(hideCount)} will be hidden as spam.
                </p>
                <div className={styles.actionField}>
                    <span>Reason</span>
                    <SpamReasonTag/>
                </div>
                <label className={cn(styles.actionField, styles.actionNote)}>
                    <span>Internal note</span>
                    <Input disabled={pending || hideCount === 0} placeholder="Optional" value={note} onChange={event => setNote(event.target.value)}/>
                </label>
                <Button disabled={pending || hideCount === 0} type="submit" variant="destructive">
                    {pending ? <LoaderCircle className={styles.spin} size={16}/> : <EyeOff size={16}/>}
                    Hide {hideCount} other
                </Button>
                {message
                    ? <p className={styles.actionStatus}>{message}</p>
                    : hideCount === 0 && <p className={styles.actionStatus}>Only the selected review can still count.</p>}
                {error && <p className={styles.actionError}>{error}</p>}
            </form>
        </article>
    );
}

function ReviewCard({isLatest, isKept, keepChoiceName, label, review, showSensitive, onKeep, onOpen}: {
    isLatest: boolean;
    isKept: boolean;
    keepChoiceName: string;
    label: string;
    review: AdminReview;
    showSensitive: boolean;
    onKeep: () => void;
    onOpen: () => void;
}) {
    return (
        <article className={cn(styles.reviewCard, isKept && styles.keptReviewCard)}>
            <div className={styles.reviewCardHead}>
                <div>
                    <span>{label}</span>
                    <strong><EntityLink target={{type: "review", id: review.id}}>#{review.id}</EntityLink></strong>
                </div>
                <div className={styles.reviewCardActions}>
                    <label className={styles.keepChoice}>
                        <input checked={isKept} name={keepChoiceName} type="radio" onChange={onKeep}/>
                        <span>Keep this</span>
                    </label>
                    <Button size="sm" type="button" variant="outline" onClick={onOpen}>
                        <MessageSquareText size={15}/>
                        Open
                    </Button>
                </div>
            </div>
            <BidiParagraph className={styles.reviewText}>{review.text}</BidiParagraph>
            <div className={styles.reviewBadges}>
                {isLatest && <Badge variant="info">Latest</Badge>}
                {isKept && <Badge variant="success">Selected to keep</Badge>}
                <Badge variant={review.visible ? "success" : "danger"}>{review.visible ? "Visible" : "Hidden"}</Badge>
                <Badge variant={review.reviewed ? "success" : "warning"}>{review.reviewed ? "Reviewed" : "Not reviewed"}</Badge>
                <Badge variant={review.positive ? "success" : "danger"}>{review.score}/5</Badge>
            </div>
            <div className={styles.reviewMeta}>
                <span>{formatDateTime(review.created_at)}</span>
                {review.session_id && <EntityLink target={{type: "session", id: review.session_id}}>Session {review.session_id}</EntityLink>}
                {review.user_id && <EntityLink target={{type: "user", id: review.user_id}}>User {review.user_id}</EntityLink>}
                {review.ip_address && (
                    <EntityLink target={{type: "ip", id: review.ip_address}}>{maskIpAddress(review.ip_address, showSensitive)}</EntityLink>
                )}
                {review.course_taken && <span>{review.course_taken}</span>}
            </div>
        </article>
    );
}

function groupReviewPairs(pairs: AdminSuspiciousReviewPair[]): ReviewGroup[] {
    return linkPairs(pairs, pair => [pair.review_1, pair.review_2], review => review.id, newestReviewFirst)
        .map(group => ({...group, contentSimilarity: Math.max(...group.pairs.map(pair => pair.content_similarity))}));
}

function groupSignals(group: ReviewGroup, showSensitive: boolean) {
    return mergeSignals(group.pairs, pair => pairSignals(pair, showSensitive));
}

function pairSignals(pair: AdminSuspiciousReviewPair, showSensitive: boolean): IdentitySignal[] {
    const review = pair.review_1;
    const signals: (IdentitySignal | false)[] = [
        pair.same_session && {
            key: "same_session", label: "Same session", weight: 6, tone: "danger", icon: <UserRound size={13}/>,
            detail: review.session_id && <EntityLink target={{type: "session", id: review.session_id}}>{review.session_id}</EntityLink>,
        },
        pair.same_user && {
            key: "same_user", label: "Same user", weight: 5, tone: "danger", icon: <UserRound size={13}/>,
            detail: review.user_id && <EntityLink target={{type: "user", id: review.user_id}}>{review.user_id}</EntityLink>,
        },
        pair.same_ip && {
            key: "same_ip",
            label: pair.same_uaeu_ip ? "Same UAEU IP" : "Same IP",
            weight: pair.same_uaeu_ip ? 1 : 3,
            tone: pair.same_uaeu_ip ? "warning" : "danger",
            icon: <Wifi size={13}/>,
            detail: review.ip_address && (
                <EntityLink target={{type: "ip", id: review.ip_address}}>{maskIpAddress(review.ip_address, showSensitive)}</EntityLink>
            ),
        },
        pair.same_user_agent && {
            key: "same_user_agent", label: "Same agent", weight: 2, tone: "warning", icon: <Fingerprint size={13}/>,
            detail: review.user_agent && maskUserAgent(review.user_agent, showSensitive),
        },
        pair.same_thumbmark && {
            key: "same_thumbmark", label: "Same thumbmark", weight: 4, tone: "danger", icon: <Fingerprint size={13}/>,
            detail: review.thumbmark_fingerprint && maskFingerprint(review.thumbmark_fingerprint, showSensitive),
        },
        pair.same_creep && {
            key: "same_creep", label: "Same creep", weight: 4, tone: "danger", icon: <Fingerprint size={13}/>,
            detail: review.creep_fingerprint && maskFingerprint(review.creep_fingerprint, showSensitive),
        },
        pair.similar_content && {
            key: "similar_content", label: "Similar text", weight: 2, tone: "warning", icon: <MessageSquareText size={13}/>,
            detail: formatPercent(pair.content_similarity),
        },
        pair.close_timing && {
            key: "close_timing", label: "Close timing", weight: 2, tone: "warning", icon: <Timer size={13}/>,
            detail: formatDuration(pair.created_delta_seconds),
        },
        pair.same_language && {
            key: "same_language", label: "Same language", weight: 1, tone: "info", icon: <Languages size={13}/>, detail: review.language,
        },
        pair.same_score && {
            key: "same_score", label: "Same score", weight: 1, tone: "info", icon: <Star size={13}/>, detail: `${review.score}/5`,
        },
        pair.same_recommendation && {
            key: "same_recommendation", label: "Same verdict", weight: 1, tone: "info", icon: <ThumbsUp size={13}/>,
            detail: review.positive ? "Recommended" : "Not recommended",
        },
    ];
    return signals.filter((signal): signal is IdentitySignal => Boolean(signal));
}

function filterChips(filters: AdminSuspiciousReviewFilters) {
    return [
        ...textChip("search", "Search", filters.search),
        ...textChip("professor_email", "Email", filters.professor_email),
        ...(filters.min_score !== defaultFilters.min_score ? [{key: "min_score", label: `Score ${filters.min_score || "0"}+`}] : []),
        ...(filters.similarity_threshold !== defaultFilters.similarity_threshold
            ? [{key: "similarity_threshold", label: `Similarity ${formatPercent(Number(filters.similarity_threshold))}+`}]
            : []),
        ...optionChip("visible", filters.visible, defaultFilters.visible, visibleOptions),
        ...(filters.include_content_only === "true" ? [{key: "include_content_only", label: "Content-only"}] : []),
    ];
}

function reviewsToHide(group: ReviewGroup, keptId: string) {
    return group.items.filter(review => review.visible && review.id !== keptId).length;
}

function pluralizeReview(count: number) {
    return count === 1 ? "review" : "reviews";
}

function bulkSuccessMessage(groupCount: number, reviewCount: number, resolvedReports: number) {
    const message = `${reviewCount} ${pluralizeReview(reviewCount)} hidden as spam across ${groupCount} ${groupCount === 1 ? "group" : "groups"}. The chosen review in each group was kept.`;
    return resolvedReports > 0 ? `${message} ${resolvedReports} reports resolved.` : message;
}

function recordsEqual(first: Record<string, string>, second: Record<string, string>) {
    const keys = Object.keys(first);
    return keys.length === Object.keys(second).length && keys.every(key => first[key] === second[key]);
}

function formatPercent(value: number) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "0%";
}
