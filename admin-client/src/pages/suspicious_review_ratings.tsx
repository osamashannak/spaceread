import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    Fingerprint,
    Gauge,
    LoaderCircle,
    MessageSquareText,
    ThumbsDown,
    ThumbsUp,
    Timer,
    Trash2,
    TriangleAlert,
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
    useLockedBodyScroll,
    useSuspiciousPairs,
} from "@/components/admin/suspicious_queue";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
    AdminApiError,
    type AdminReviewRating,
    type AdminSuspiciousReviewRatingFilters,
    type AdminSuspiciousReviewRatingPair,
    deleteAdminReviewRatings,
    listAdminSuspiciousReviewRatingPairs,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";

type RatingGroup = LinkedGroup<AdminSuspiciousReviewRatingPair, AdminReviewRating>;

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

const newestRatingFirst = compareNewestFirst<AdminReviewRating>(rating => rating.session_id);

export function SuspiciousReviewRatingsPage() {
    const [groupSort, setGroupSort] = useState<GroupSort>("recency");
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deletePending, setDeletePending] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteNote, setDeleteNote] = useState("");
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const {openEntity, showSensitive, toggleSensitive} = useAdminEntityDrawer();
    useLockedBodyScroll(dialogOpen);

    const filterState = useDraftFilters(defaultFilters, {
        normalize: normalizeFilters,
        onApplied: () => {
            setSelectedKeys(new Set());
            setActionMessage(null);
        },
    });
    const {pairs, setPairs, loadState, error, isRefreshing, reload} = useSuspiciousPairs(
        listAdminSuspiciousReviewRatingPairs,
        filterState.filters,
        "Could not load suspicious ratings.",
        loaded => {
            const loadedKeys = new Set(uniqueRatings(loaded).map(ratingKey));
            setSelectedKeys(current => new Set([...current].filter(key => loadedKeys.has(key))));
        },
    );

    const groups = useMemo(
        () => sortLinkedGroups(linkPairs(pairs, pair => [pair.rating_1, pair.rating_2], ratingKey, newestRatingFirst), groupSort, newestRatingFirst),
        [pairs, groupSort],
    );
    const loadedRatings = useMemo(() => uniqueRatings(pairs), [pairs]);
    const selectedRatings = useMemo(() => loadedRatings.filter(rating => selectedKeys.has(ratingKey(rating))), [loadedRatings, selectedKeys]);
    const allSelected = loadedRatings.length > 0 && selectedRatings.length === loadedRatings.length;
    const selectedLikes = selectedRatings.filter(rating => rating.value === "like").length;
    const selectedReviewCount = new Set(selectedRatings.map(rating => rating.review_id)).size;
    const signalCount = useMemo(() => groups.reduce((sum, group) => sum + groupSignals(group, showSensitive).length, 0), [groups, showSensitive]);
    const linkedRatingCount = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);

    function toggleRating(key: string, checked: boolean) {
        setActionMessage(null);
        setSelectedKeys(current => {
            const next = new Set(current);
            if (checked) next.add(key); else next.delete(key);
            return next;
        });
    }

    function toggleAll(checked: boolean) {
        setActionMessage(null);
        setSelectedKeys(checked ? new Set(loadedRatings.map(ratingKey)) : new Set());
    }

    function closeDialog() {
        if (deletePending) return;
        setDialogOpen(false);
        setDeleteError(null);
    }

    async function deleteSelected() {
        if (deletePending || selectedRatings.length === 0) return;
        const targetKeys = new Set(selectedRatings.map(ratingKey));

        setDeletePending(true);
        setDeleteError(null);
        setActionMessage(null);
        try {
            const response = await deleteAdminReviewRatings({
                ratings: selectedRatings.map(rating => ({review_id: rating.review_id, session_id: rating.session_id})),
                note: deleteNote.trim() || undefined,
            });
            setPairs(current => current.filter(pair => !targetKeys.has(ratingKey(pair.rating_1)) && !targetKeys.has(ratingKey(pair.rating_2))));
            setSelectedKeys(new Set());
            setDialogOpen(false);
            setDeleteNote("");
            setActionMessage(deleteSuccessMessage(response.deleted_count, response.requested_count));
            reload("refresh");
        } catch (err: unknown) {
            setDeleteError(err instanceof AdminApiError ? err.message : "Could not delete the selected ratings.");
        } finally {
            setDeletePending(false);
        }
    }

    return (
        <div className={styles.page}>
            <SuspiciousPageHeader
                eyebrow="Review ratings"
                title="Suspicious ratings"
                note="Up to 100 pair matches"
                isRefreshing={isRefreshing}
                onRefresh={() => reload("refresh")}
                showSensitive={showSensitive}
                onToggleSensitive={toggleSensitive}
            />

            <SummaryStrip
                label="Suspicious rating summary"
                stats={[
                    {icon: <UserRound size={16}/>, label: "Linked groups", value: groups.length},
                    {icon: <Gauge size={16}/>, label: "Linked ratings", value: linkedRatingCount},
                    {icon: <AlertCircle size={16}/>, label: "Signals", value: signalCount},
                ]}
            />

            <SuspiciousFilters
                state={filterState}
                label="Suspicious ratings"
                searchPlaceholder="Search professor, review ID, or text"
                quickClassName={styles.ratingQuickFilters}
                groupSort={groupSort}
                onGroupSortChange={setGroupSort}
                quickFields={(
                    <>
                        <FilterInput state={filterState} field="min_score" label="Min score" compact type="number" min="0" max="16"/>
                        <FilterSelect state={filterState} field="value" label="Vote" compact options={valueOptions}/>
                        <FilterSelect state={filterState} field="visible" label="Review" compact options={visibleOptions}/>
                    </>
                )}
                sheetHeading="Suspicious rating fields"
                sheetFields={(
                    <>
                        <FilterGroup title="Find linked ratings">
                            <FilterInput state={filterState} field="search" label="Search" placeholder="Professor, review ID, or text"/>
                            <FilterInput
                                state={filterState}
                                field="review_id"
                                label="Review ID"
                                inputMode="numeric"
                                placeholder="Exact review ID"
                                sanitize={value => value.replace(/\D/g, "")}
                            />
                            <FilterInput state={filterState} field="professor_email" label="Professor email" placeholder="name@uaeu.ac.ae"/>
                        </FilterGroup>
                        <FilterGroup title="Threshold and vote">
                            <div className={styles.rangePair}>
                                <FilterInput state={filterState} field="min_score" label="Minimum score" type="number" min="0" max="16"/>
                                <FilterSelect state={filterState} field="value" label="Vote pattern" options={valueOptions}/>
                            </div>
                        </FilterGroup>
                        <FilterGroup title="Parent review visibility">
                            <FilterSelect state={filterState} field="visible" label="Reviews" options={visibleOptions}/>
                        </FilterGroup>
                    </>
                )}
                chips={filterChips(filterState.filters)}
            />

            <section className={styles.ratingBulkBar} aria-label="Rating selection and deletion">
                <SelectAllCheckbox
                    checked={allSelected}
                    disabled={loadedRatings.length === 0 || deletePending}
                    indeterminate={selectedRatings.length > 0 && !allSelected}
                    label={selectedRatings.length > 0
                        ? `${selectedRatings.length} of ${loadedRatings.length} ratings selected`
                        : `${loadedRatings.length} ratings loaded`}
                    onChange={toggleAll}
                />
                <div className={styles.ratingBulkActions}>
                    {actionMessage && <span className={styles.selectionStatus} role="status">{actionMessage}</span>}
                    {selectedRatings.length > 0 && (
                        <Button disabled={deletePending} size="sm" type="button" variant="ghost" onClick={() => toggleAll(false)}>
                            Clear selection
                        </Button>
                    )}
                    <Button
                        disabled={selectedRatings.length === 0 || deletePending}
                        size="sm"
                        type="button"
                        variant="destructive"
                        onClick={() => {
                            setDeleteError(null);
                            setDialogOpen(true);
                        }}
                    >
                        <Trash2 size={15}/>
                        Delete selected as spam
                    </Button>
                </div>
            </section>

            {dialogOpen && createPortal((
                <div className={styles.filterSheetLayer}>
                    <button aria-label="Cancel rating deletion" className={styles.filterSheetBackdrop} type="button" onClick={closeDialog}/>
                    <section
                        aria-describedby="delete-rating-description"
                        aria-labelledby="delete-rating-title"
                        aria-modal="true"
                        className={styles.deleteDialog}
                        role="alertdialog"
                    >
                        <header className={styles.deleteDialogHeader}>
                            <span className={styles.deleteDialogIcon}><TriangleAlert size={20}/></span>
                            <div>
                                <h2 id="delete-rating-title">Permanently delete {selectedRatings.length} {selectedRatings.length === 1 ? "rating" : "ratings"}?</h2>
                                <p id="delete-rating-description">
                                    This drops the selected rating rows from the database. This action cannot be undone.
                                </p>
                            </div>
                        </header>
                        <div className={styles.deleteDialogStats}>
                            <span><strong>{selectedLikes}</strong> {selectedLikes === 1 ? "like" : "likes"}</span>
                            <span><strong>{selectedRatings.length - selectedLikes}</strong> {selectedRatings.length - selectedLikes === 1 ? "dislike" : "dislikes"}</span>
                            <span><strong>{selectedReviewCount}</strong> {selectedReviewCount === 1 ? "review" : "reviews"} affected</span>
                        </div>
                        <div className={styles.deleteDialogFields}>
                            <div className={styles.bulkField}>
                                <span>Reason</span>
                                <SpamReasonTag/>
                            </div>
                            <label className={cn(styles.bulkField, styles.bulkNote)}>
                                <span>Internal note · optional</span>
                                <Textarea
                                    disabled={deletePending}
                                    maxLength={4000}
                                    placeholder="Add context for the moderation audit log"
                                    rows={3}
                                    value={deleteNote}
                                    onChange={event => setDeleteNote(event.target.value)}
                                />
                            </label>
                        </div>
                        <p className={styles.deleteWarning}>
                            The affected reviews’ like and dislike totals will be updated after deletion.
                        </p>
                        {deleteError && <p className={styles.actionError} role="alert">{deleteError}</p>}
                        <footer className={styles.deleteDialogActions}>
                            <Button autoFocus disabled={deletePending} type="button" variant="ghost" onClick={closeDialog}>
                                Cancel
                            </Button>
                            <Button disabled={deletePending} type="button" variant="destructive" onClick={() => void deleteSelected()}>
                                {deletePending ? <LoaderCircle className={styles.spin} size={16}/> : <Trash2 size={16}/>}
                                {deletePending ? "Deleting…" : "Delete permanently"}
                            </Button>
                        </footer>
                    </section>
                </div>
            ), document.body)}

            <QueueFeed
                loadState={loadState}
                isRefreshing={isRefreshing}
                hasPairs={pairs.length > 0}
                hasGroups={groups.length > 0}
                error={error}
                errorTitle="Suspicious ratings could not be loaded"
                emptyTitle="No linked ratings found"
                emptyText="No review currently has multiple ratings linked by the selected identity signals."
                onRetry={() => reload("initial")}
            >
                {groups.map(group => (
                    <RatingGroupRow
                        key={group.key}
                        group={group}
                        selectedKeys={selectedKeys}
                        selectionDisabled={deletePending}
                        showSensitive={showSensitive}
                        onOpenReview={() => openEntity({type: "review", id: group.pairs[0].review.id})}
                        onToggleRating={toggleRating}
                    />
                ))}
            </QueueFeed>
        </div>
    );
}

function SelectAllCheckbox({checked, disabled, indeterminate, label, onChange}: {
    checked: boolean;
    disabled: boolean;
    indeterminate: boolean;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <label className={styles.selectionToggle}>
            <input
                ref={inputRef}
                aria-label="Select all loaded ratings"
                checked={checked}
                disabled={disabled}
                type="checkbox"
                onChange={event => onChange(event.target.checked)}
            />
            <span>{label}</span>
        </label>
    );
}

function RatingGroupRow({group, selectedKeys, selectionDisabled, showSensitive, onOpenReview, onToggleRating}: {
    group: RatingGroup;
    selectedKeys: Set<string>;
    selectionDisabled: boolean;
    showSensitive: boolean;
    onOpenReview: () => void;
    onToggleRating: (key: string, checked: boolean) => void;
}) {
    const review = group.pairs[0].review;
    const likeCount = group.items.filter(rating => rating.value === "like").length;
    const dislikeCount = group.items.length - likeCount;
    const selectedCount = group.items.filter(rating => selectedKeys.has(ratingKey(rating))).length;

    return (
        <article className={cn(styles.pairRow, selectedCount > 0 && styles.pairSelected)}>
            <header className={styles.pairHeader}>
                <div className={styles.pairTitle}>
                    <Badge className={styles.scoreBadge} variant={scoreTone(group.suspicionScore)}>Score {group.suspicionScore}</Badge>
                    <div>
                        <strong>{review.professor_name}</strong>
                        <span>{review.professor_email} · Review #{review.id}</span>
                    </div>
                </div>
                <div className={styles.pairMeta}>
                    <Badge variant="danger">{group.items.length} linked ratings</Badge>
                    <Badge variant="success"><ThumbsUp size={12}/> {likeCount}</Badge>
                    <Badge variant={dislikeCount > 0 ? "warning" : "outline"}><ThumbsDown size={12}/> {dislikeCount}</Badge>
                    <Badge variant="outline">{formatDuration(group.createdSpanSeconds)} span</Badge>
                    {selectedCount > 0 && <Badge variant="info">{selectedCount} selected</Badge>}
                </div>
            </header>

            <SignalBadges signals={groupSignals(group, showSensitive)}/>

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
                {group.items.map((rating, index) => (
                    <RatingCard
                        key={ratingKey(rating)}
                        isLatest={index === 0}
                        label={index === 0 ? "Latest rating" : `Earlier rating ${index}`}
                        rating={rating}
                        selected={selectedKeys.has(ratingKey(rating))}
                        selectionDisabled={selectionDisabled}
                        showSensitive={showSensitive}
                        onToggle={checked => onToggleRating(ratingKey(rating), checked)}
                    />
                ))}
            </div>
        </article>
    );
}

function RatingCard({isLatest, label, rating, selected, selectionDisabled, showSensitive, onToggle}: {
    isLatest: boolean;
    label: string;
    rating: AdminReviewRating;
    selected: boolean;
    selectionDisabled: boolean;
    showSensitive: boolean;
    onToggle: (checked: boolean) => void;
}) {
    const isLike = rating.value === "like";
    const hasDeviceDetails = Boolean(rating.user_agent || rating.thumbmark_fingerprint || rating.creep_fingerprint);

    return (
        <article className={cn(styles.reviewCard, selected && styles.ratingCardSelected)}>
            <div className={styles.reviewCardHead}>
                <div>
                    <span>{label}</span>
                    <strong>{isLike ? "Like" : "Dislike"}</strong>
                </div>
                <div className={styles.reviewCardActions}>
                    <label className={styles.ratingSelector}>
                        <input
                            aria-label={`Select ${rating.value} from session ${rating.session_id}`}
                            checked={selected}
                            disabled={selectionDisabled}
                            type="checkbox"
                            onChange={event => onToggle(event.target.checked)}
                        />
                        <span>{selected ? "Selected" : "Select"}</span>
                    </label>
                    {isLike ? <ThumbsUp size={18}/> : <ThumbsDown size={18}/>}
                </div>
            </div>
            <div className={styles.reviewBadges}>
                {isLatest && <Badge variant="info">Latest</Badge>}
                <Badge variant={isLike ? "success" : "danger"}>{isLike ? "Like" : "Dislike"}</Badge>
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

function ratingKey(rating: AdminReviewRating) {
    return `${rating.review_id}:${rating.session_id}`;
}

function uniqueRatings(pairs: AdminSuspiciousReviewRatingPair[]) {
    const ratings = new Map<string, AdminReviewRating>();
    for (const pair of pairs) {
        ratings.set(ratingKey(pair.rating_1), pair.rating_1);
        ratings.set(ratingKey(pair.rating_2), pair.rating_2);
    }
    return [...ratings.values()].sort(newestRatingFirst);
}

function groupSignals(group: RatingGroup, showSensitive: boolean) {
    return mergeSignals(group.pairs, pair => pairSignals(pair, showSensitive));
}

function pairSignals(pair: AdminSuspiciousReviewRatingPair, showSensitive: boolean): IdentitySignal[] {
    const rating = pair.rating_1;
    const signals: (IdentitySignal | false)[] = [
        pair.same_thumbmark && {
            key: "same_thumbmark", label: "Same thumbmark", weight: 5, tone: "danger", icon: <Fingerprint size={13}/>,
            detail: rating.thumbmark_fingerprint && maskFingerprint(rating.thumbmark_fingerprint, showSensitive),
        },
        pair.same_creep && {
            key: "same_creep", label: "Same creep", weight: 5, tone: "danger", icon: <Fingerprint size={13}/>,
            detail: rating.creep_fingerprint && maskFingerprint(rating.creep_fingerprint, showSensitive),
        },
        pair.same_ip && {
            key: "same_ip", label: "Same IP", weight: 2, tone: "danger", icon: <Wifi size={13}/>,
            detail: <EntityLink target={{type: "ip", id: rating.ip_address}}>{maskIpAddress(rating.ip_address, showSensitive)}</EntityLink>,
        },
        pair.same_user_agent && {
            key: "same_user_agent", label: "Same agent", weight: 1, tone: "warning", icon: <Fingerprint size={13}/>,
            detail: rating.user_agent && maskUserAgent(rating.user_agent, showSensitive),
        },
        pair.close_timing && {
            key: "close_timing", label: "Close timing", weight: 2, tone: "warning", icon: <Timer size={13}/>,
            detail: formatDuration(pair.created_delta_seconds),
        },
        pair.same_value && {
            key: "same_value",
            label: "Same vote",
            weight: 1,
            tone: "info",
            icon: rating.value === "like" ? <ThumbsUp size={13}/> : <ThumbsDown size={13}/>,
            detail: rating.value === "like" ? "Like" : "Dislike",
        },
    ];
    return signals.filter((signal): signal is IdentitySignal => Boolean(signal));
}

function normalizeFilters(filters: AdminSuspiciousReviewRatingFilters): AdminSuspiciousReviewRatingFilters {
    const rawScore = filters.min_score.trim();
    const parsedScore = rawScore === "" ? 0 : Number(rawScore);
    const minScore = Number.isFinite(parsedScore) ? Math.min(16, Math.max(0, Math.trunc(parsedScore))) : Number(defaultFilters.min_score);
    const reviewId = filters.review_id.trim();

    return {
        ...filters,
        min_score: String(minScore),
        search: filters.search.trim(),
        review_id: /^\d+$/.test(reviewId) ? reviewId : "",
        professor_email: filters.professor_email.trim(),
    };
}

function filterChips(filters: AdminSuspiciousReviewRatingFilters) {
    return [
        ...textChip("search", "Search", filters.search),
        ...textChip("review_id", "Review", filters.review_id),
        ...textChip("professor_email", "Email", filters.professor_email),
        ...(filters.min_score !== defaultFilters.min_score ? [{key: "min_score", label: `Score ${filters.min_score || "0"}+`}] : []),
        ...optionChip("value", filters.value, defaultFilters.value, valueOptions),
        ...optionChip("visible", filters.visible, defaultFilters.visible, visibleOptions),
    ];
}

function deleteSuccessMessage(deletedCount: number, requestedCount: number) {
    const deleted = `${deletedCount} ${deletedCount === 1 ? "rating" : "ratings"} deleted as spam.`;
    const absent = Math.max(0, requestedCount - deletedCount);
    return absent === 0 ? deleted : `${deleted} ${absent} ${absent === 1 ? "rating was" : "ratings were"} already absent.`;
}
