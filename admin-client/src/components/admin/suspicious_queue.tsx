import {type ComponentProps, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    Filter,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldAlert,
    SlidersHorizontal,
    X,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {AdminApiError} from "@/lib/admin_api";
import {useUrlFilters} from "@/lib/url_state";
import {cn} from "@/lib/utils";
import styles from "./suspicious_queue.module.scss";

// Shared pieces of the suspicious reviews and suspicious ratings queues.

export {styles as suspiciousStyles};

export type LoadState = "loading" | "ready" | "error";
export type BadgeTone = "default" | "warning" | "danger" | "info" | "success" | "outline";
export type GroupSort = "recency" | "score" | "group_size";

export type IdentitySignal = {
    key: string;
    label: string;
    weight: number;
    tone: BadgeTone;
    icon: ReactNode;
    detail?: ReactNode;
};

export type LinkedGroup<P, I> = {
    key: string;
    pairs: P[];
    items: I[];
    suspicionScore: number;
    createdSpanSeconds: number;
};

export const groupSortOptions: { label: string; value: GroupSort }[] = [
    {label: "Most recent", value: "recency"},
    {label: "Highest score", value: "score"},
    {label: "Largest group", value: "group_size"},
];

type StringFilters = Record<string, string>;

/** Loads suspicious pairs for the applied filters and tracks refresh state. */
export function useSuspiciousPairs<F, P>(
    fetchPairs: (signal: AbortSignal, filters: F) => Promise<{ pairs: P[] }>,
    filters: F,
    errorMessage: string,
    onLoaded?: (pairs: P[]) => void,
) {
    const [pairs, setPairs] = useState<P[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Keep the latest callbacks without making them reload triggers.
    const fetchRef = useRef(fetchPairs);
    const loadedRef = useRef(onLoaded);
    fetchRef.current = fetchPairs;
    loadedRef.current = onLoaded;

    const reload = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        fetchRef.current(controller.signal, filters)
            .then(response => {
                setPairs(response.pairs);
                loadedRef.current?.(response.pairs);
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                setError(err instanceof AdminApiError ? err.message : errorMessage);
            })
            .finally(() => setIsRefreshing(false));

        return () => controller.abort();
    }, [filters, errorMessage]);

    useEffect(() => reload("initial"), [reload]);

    return {pairs, setPairs, loadState, error, isRefreshing, reload};
}

/** Draft-and-apply filter state shared by both queues. */
export function useDraftFilters<F extends StringFilters>(
    defaults: F,
    options: { normalize?: (filters: F) => F; onApplied?: () => void } = {},
) {
    const [filters, setFilters] = useUrlFilters(defaults);
    const [draft, setDraft] = useState<F>(filters);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Follow back/forward navigation that changes the applied filters.
    useEffect(() => setDraft(filters), [filters]);

    function update<K extends keyof F>(key: K, value: F[K]) {
        setDraft(current => ({...current, [key]: value}));
    }

    function apply(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const next = options.normalize ? options.normalize(draft) : {...draft};
        setDraft(next);
        setFilters(next);
        setSheetOpen(false);
        options.onApplied?.();
    }

    function cancel() {
        setDraft(filters);
        setSheetOpen(false);
    }

    function resetAll() {
        setDraft(defaults);
        setFilters(defaults);
        setSheetOpen(false);
        options.onApplied?.();
    }

    return {
        filters,
        draft,
        sheetOpen,
        update,
        apply,
        cancel,
        resetAll,
        openSheet: () => setSheetOpen(true),
        resetDraft: () => setDraft(defaults),
        activeCount: countChanged(filters, defaults),
        draftCount: countChanged(draft, defaults),
        dirty: !filtersEqual(draft, filters, defaults),
        isDefault: filtersEqual(filters, defaults, defaults),
        draftIsDefault: filtersEqual(draft, defaults, defaults),
    };
}

export type DraftFilterState<F extends StringFilters> = ReturnType<typeof useDraftFilters<F>>;

/** Stops the page behind a modal sheet or dialog from scrolling. */
export function useLockedBodyScroll(locked: boolean) {
    useEffect(() => {
        if (!locked) return;

        const body = document.body.style;
        const root = document.documentElement.style;
        const previous = {
            overflow: body.overflow,
            overscroll: body.overscrollBehavior,
            paddingRight: body.paddingRight,
            rootOverscroll: root.overscrollBehavior,
        };
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        body.overflow = "hidden";
        body.overscrollBehavior = "none";
        if (scrollbarWidth > 0) body.paddingRight = `${scrollbarWidth}px`;
        root.overscrollBehavior = "none";

        return () => {
            body.overflow = previous.overflow;
            body.overscrollBehavior = previous.overscroll;
            body.paddingRight = previous.paddingRight;
            root.overscrollBehavior = previous.rootOverscroll;
        };
    }, [locked]);
}

/**
 * Joins pairs that share an item into groups (union-find), so three reviews
 * from one person show as one group instead of three pairs.
 */
export function linkPairs<P extends { suspicion_score: number }, I extends { created_at: string }>(
    pairs: P[],
    membersOf: (pair: P) => [I, I],
    keyOf: (item: I) => string,
    compareNewest: (first?: I, second?: I) => number,
): LinkedGroup<P, I>[] {
    const parents = new Map<string, string>();
    const itemsByKey = new Map<string, I>();

    function find(key: string): string {
        const parent = parents.get(key) || key;
        if (parent === key) return parent;
        const root = find(parent);
        parents.set(key, root);
        return root;
    }

    for (const pair of pairs) {
        for (const item of membersOf(pair)) {
            const key = keyOf(item);
            if (!parents.has(key)) parents.set(key, key);
            itemsByKey.set(key, item);
        }
    }
    for (const pair of pairs) {
        const [first, second] = membersOf(pair).map(item => find(keyOf(item)));
        if (first !== second) parents.set(second, first);
    }

    const pairsByRoot = new Map<string, P[]>();
    for (const pair of pairs) {
        const root = find(keyOf(membersOf(pair)[0]));
        pairsByRoot.set(root, [...(pairsByRoot.get(root) || []), pair]);
    }

    return [...pairsByRoot.values()].map(groupPairs => {
        const keys = [...new Set(groupPairs.flatMap(pair => membersOf(pair).map(keyOf)))];
        const items = keys
            .map(key => itemsByKey.get(key))
            .filter((item): item is I => Boolean(item))
            .sort(compareNewest);
        const newest = Date.parse(items[0]?.created_at || "");
        const oldest = Date.parse(items[items.length - 1]?.created_at || "");

        return {
            key: keys.sort().join("|"),
            pairs: groupPairs,
            items,
            suspicionScore: Math.max(...groupPairs.map(pair => pair.suspicion_score)),
            createdSpanSeconds: Number.isFinite(newest) && Number.isFinite(oldest)
                ? Math.max(0, Math.round((newest - oldest) / 1000))
                : 0,
        };
    });
}

export function sortLinkedGroups<P, I>(
    groups: LinkedGroup<P, I>[],
    sort: GroupSort,
    compareNewest: (first?: I, second?: I) => number,
) {
    return [...groups].sort((first, second) => {
        if (sort === "score" && second.suspicionScore !== first.suspicionScore) {
            return second.suspicionScore - first.suspicionScore;
        }
        if (sort === "group_size" && second.items.length !== first.items.length) {
            return second.items.length - first.items.length;
        }
        return compareNewest(first.items[0], second.items[0])
            || first.key.localeCompare(second.key, undefined, {numeric: true});
    });
}

/** Every distinct identity signal across a group's pairs, strongest first. */
export function mergeSignals<P>(pairs: P[], signalsOf: (pair: P) => IdentitySignal[]) {
    const byKey = new Map<string, IdentitySignal>();
    for (const pair of pairs) {
        for (const signal of signalsOf(pair)) {
            if (!byKey.has(signal.key)) byKey.set(signal.key, signal);
        }
    }
    return [...byKey.values()].sort((first, second) => second.weight - first.weight);
}

export function compareNewestFirst<I extends { created_at: string }>(tiebreak: (item: I) => string) {
    return (first?: I, second?: I) => {
        const difference = Date.parse(second?.created_at || "") - Date.parse(first?.created_at || "");
        if (Number.isFinite(difference) && difference !== 0) return difference;
        return (second ? tiebreak(second) : "").localeCompare(first ? tiebreak(first) : "", undefined, {numeric: true});
    };
}

export function SuspiciousPageHeader({eyebrow, title, note, isRefreshing, onRefresh, showSensitive, onToggleSensitive}: {
    eyebrow: string;
    title: string;
    note?: string;
    isRefreshing: boolean;
    onRefresh: () => void;
    showSensitive: boolean;
    onToggleSensitive: () => void;
}) {
    return (
        <div className={styles.intro}>
            <div>
                <p className={styles.eyebrow}>{eyebrow}</p>
                <h1 className={styles.title}>{title}</h1>
            </div>
            <div className={styles.introActions}>
                {note && <span className={styles.previewNote}>{note}</span>}
                {isRefreshing && <span className={cn(styles.previewNote, styles.refreshingNote)}>Refreshing</span>}
                <Button className={styles.refreshButton} disabled={isRefreshing} type="button" variant="outline" onClick={onRefresh}>
                    {isRefreshing ? <LoaderCircle className={styles.spin} size={16}/> : <RefreshCw size={16}/>}
                    Refresh
                </Button>
                <Button type="button" variant="outline" onClick={onToggleSensitive}>
                    {showSensitive ? <EyeOff size={16}/> : <Eye size={16}/>}
                    {showSensitive ? "Hide sensitive" : "Show sensitive"}
                </Button>
            </div>
        </div>
    );
}

export function SummaryStrip({label, stats}: { label: string; stats: { icon: ReactNode; label: string; value: number }[] }) {
    return (
        <section className={styles.summaryStrip} aria-label={label}>
            {stats.map(stat => (
                <div className={styles.summaryStat} key={stat.label}>
                    <span>{stat.icon}</span>
                    <div>
                        <strong>{stat.value}</strong>
                        <small>{stat.label}</small>
                    </div>
                </div>
            ))}
        </section>
    );
}

/** Search box, quick filters, sort, and the "More" filter sheet. */
export function SuspiciousFilters<F extends StringFilters & { search: string }>({
    state,
    label,
    searchPlaceholder,
    quickFields,
    quickClassName,
    groupSort,
    onGroupSortChange,
    sheetHeading,
    sheetFields,
    chips,
}: {
    state: DraftFilterState<F>;
    label: string;
    searchPlaceholder: string;
    quickFields: ReactNode;
    quickClassName?: string;
    groupSort: GroupSort;
    onGroupSortChange: (sort: GroupSort) => void;
    sheetHeading: string;
    sheetFields: ReactNode;
    chips: { key: string; label: string }[];
}) {
    useLockedBodyScroll(state.sheetOpen);

    return (
        <section className={styles.filters} aria-label={label}>
            <form className={styles.filterToolbar} onSubmit={state.apply}>
                <label className={styles.filterSearch}>
                    <Search size={16}/>
                    <Input
                        aria-label={`Search ${label.toLowerCase()}`}
                        placeholder={searchPlaceholder}
                        value={state.draft.search}
                        onChange={event => state.update("search", event.target.value as F["search"])}
                    />
                </label>
                <div className={cn(styles.quickFilters, quickClassName)}>
                    {quickFields}
                    <label className={styles.compactFilterField}>
                        <span>Sort</span>
                        <select
                            aria-label="Sort groups"
                            className={styles.selectInput}
                            value={groupSort}
                            onChange={event => onGroupSortChange(event.target.value as GroupSort)}
                        >
                            {groupSortOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className={styles.filterActions}>
                    <Button disabled={!state.dirty} type="submit">
                        <Search size={16}/>
                        Apply
                    </Button>
                    <Button type="button" variant="outline" onClick={state.openSheet}>
                        <SlidersHorizontal size={16}/>
                        More
                        {state.activeCount > 0 && <Badge className={styles.filterCountBadge} variant="warning">{state.activeCount}</Badge>}
                    </Button>
                    <Button disabled={state.isDefault && state.draftIsDefault} type="button" variant="ghost" onClick={state.resetAll}>
                        <RotateCcw size={16}/>
                        Reset
                    </Button>
                </div>
            </form>
            <div className={styles.appliedFilterRow}>
                {chips.length > 0 ? chips.map(chip => <span key={chip.key}>{chip.label}</span>) : <span>Default queue</span>}
            </div>
            {state.sheetOpen && createPortal((
                <div className={styles.filterSheetLayer}>
                    <button aria-label="Close filters" className={styles.filterSheetBackdrop} type="button" onClick={state.cancel}/>
                    <aside aria-label={label} aria-modal="true" className={styles.filterSheet} role="dialog">
                        <header className={styles.filterSheetHeader}>
                            <div>
                                <span><Filter size={14}/> Filters</span>
                                <h2>{sheetHeading}</h2>
                                <p>{state.dirty ? `${state.draftCount} changed fields` : "No unapplied changes"}</p>
                            </div>
                            <Button size="icon" type="button" variant="ghost" aria-label="Close filters" onClick={state.cancel}>
                                <X size={16}/>
                            </Button>
                        </header>
                        <div className={styles.filterSheetBody}>{sheetFields}</div>
                        <footer className={styles.filterSheetFooter}>
                            <Button disabled={state.draftIsDefault} size="sm" type="button" variant="outline" onClick={state.resetDraft}>
                                <RotateCcw size={15}/>
                                Reset
                            </Button>
                            <Button size="sm" type="button" variant="ghost" onClick={state.cancel}>
                                Cancel
                            </Button>
                            <Button disabled={!state.dirty} size="sm" type="button" onClick={() => state.apply()}>
                                <CheckCircle2 size={15}/>
                                Apply filters
                            </Button>
                        </footer>
                    </aside>
                </div>
            ), document.body)}
        </section>
    );
}

export function FilterGroup({title, children}: { title: string; children: ReactNode }) {
    return (
        <div className={styles.filterGroup}>
            <strong>{title}</strong>
            <div>{children}</div>
        </div>
    );
}

/** A labelled select bound to one filter key. */
export function FilterSelect<F extends StringFilters, K extends keyof F & string>({
    state,
    field,
    label,
    options,
    compact = false,
}: {
    state: DraftFilterState<F>;
    field: K;
    label: string;
    options: { label: string; value: F[K] }[];
    compact?: boolean;
}) {
    return (
        <label className={compact ? styles.compactFilterField : styles.filterField}>
            <span>{label}</span>
            <select
                className={styles.selectInput}
                value={state.draft[field]}
                onChange={event => state.update(field, event.target.value as F[K])}
            >
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    );
}

/** A labelled text or number input bound to one filter key. */
export function FilterInput<F extends StringFilters, K extends keyof F & string>({
    state,
    field,
    label,
    compact = false,
    sanitize,
    ...inputProps
}: {
    state: DraftFilterState<F>;
    field: K;
    label: string;
    compact?: boolean;
    sanitize?: (value: string) => string;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
    return (
        <label className={compact ? styles.compactFilterField : styles.filterField}>
            <span>{label}</span>
            <Input
                aria-label={label}
                {...inputProps}
                value={state.draft[field]}
                onChange={event => state.update(field, (sanitize ? sanitize(event.target.value) : event.target.value) as F[K])}
            />
        </label>
    );
}

export function SignalBadges({signals}: { signals: IdentitySignal[] }) {
    return (
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
    );
}

/** The reason every suspicious action records; there is nothing to choose. */
export function SpamReasonTag() {
    return (
        <div className={styles.fixedReason} title="Suspicious review and rating actions are always logged as spam">
            <ShieldAlert size={14}/>
            Spam or manipulation
        </div>
    );
}

/** Loading skeleton, error and empty states around the group list. */
export function QueueFeed({loadState, isRefreshing, hasPairs, hasGroups, error, errorTitle, emptyTitle, emptyText, onRetry, children}: {
    loadState: LoadState;
    isRefreshing: boolean;
    hasPairs: boolean;
    hasGroups: boolean;
    error: string | null;
    errorTitle: string;
    emptyTitle: string;
    emptyText: string;
    onRetry: () => void;
    children: ReactNode;
}) {
    return (
        <section className={cn(styles.feed, isRefreshing && styles.refreshingFeed)}>
            {loadState === "loading" && !hasPairs && (
                <div className={styles.pairList} aria-label="Loading">
                    {[0, 1, 2, 3].map(index => (
                        <div className={styles.skeletonRow} key={index}>
                            <span/>
                            <span/>
                            <span/>
                        </div>
                    ))}
                </div>
            )}
            {loadState === "error" && !hasPairs && (
                <div className={cn(styles.stateNotice, styles.errorNotice)}>
                    <AlertCircle size={20}/>
                    <div>
                        <strong>{errorTitle}</strong>
                        <span>{error || "The admin service did not return a usable response."}</span>
                    </div>
                    <Button type="button" variant="outline" onClick={onRetry}>
                        <RefreshCw size={16}/>
                        Refresh
                    </Button>
                </div>
            )}
            {loadState === "ready" && !hasGroups && (
                <div className={styles.stateNotice}>
                    <CheckCircle2 size={20}/>
                    <div>
                        <strong>{emptyTitle}</strong>
                        <span>{emptyText}</span>
                    </div>
                </div>
            )}
            {hasGroups && <div className={styles.pairList}>{children}</div>}
        </section>
    );
}

export function scoreTone(score: number): BadgeTone {
    if (score >= 9) return "danger";
    if (score >= 6) return "warning";
    return "info";
}

export function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
    return `${Math.round(seconds / 86400)} days`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"});

export function formatDateTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function maskIpAddress(value: string, visible: boolean) {
    const displayValue = value.replace(/\/32$/, "").replace(/\/128$/, "");
    if (visible) return displayValue;
    const parts = displayValue.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`;
    return displayValue.replace(/[A-Fa-f0-9]/g, "x");
}

export function maskUserAgent(value: string, visible: boolean) {
    return visible ? value : "Hidden";
}

export function maskFingerprint(value: string, visible: boolean) {
    if (visible || value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/** Chip for a select filter that differs from its default. */
export function optionChip<V extends string>(key: string, value: V, defaultValue: V, options: { label: string; value: V }[]) {
    if (value === defaultValue) return [];
    return [{key, label: options.find(option => option.value === value)?.label || value}];
}

export function textChip(key: string, prefix: string, value: string) {
    return value.trim() ? [{key, label: `${prefix}: ${value.trim()}`}] : [];
}

function countChanged<F extends StringFilters>(filters: F, defaults: F) {
    return Object.keys(defaults).filter(key => filters[key] !== defaults[key]).length;
}

function filtersEqual<F extends StringFilters>(a: F, b: F, defaults: F) {
    return Object.keys(defaults).every(key => a[key] === b[key]);
}
