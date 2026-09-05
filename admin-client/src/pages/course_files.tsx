import {type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    CheckCircle2,
    Download,
    Eye,
    EyeOff,
    FileText,
    Filter,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    ShieldAlert,
    StickyNote,
    X,
} from "lucide-react";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
    AdminApiError,
    type AdminCourseFileFilters,
    type AdminCourseFileSummary,
    type AdminReason,
    listAdminCourseFiles,
    saveCourseFileNote,
    setCourseFileVisibility,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./moderation.module.scss";

type LoadState = "loading" | "ready" | "error";
type Tone = "default" | "warning" | "danger" | "info" | "success";
type CourseFileFilterKey = keyof AdminCourseFileFilters;
type SelectFilterKey = {
    [K in CourseFileFilterKey]: AdminCourseFileFilters[K] extends string ? K : never
}[CourseFileFilterKey];
type BulkCourseFileAction = "approve" | "hide" | "note";

const defaultCourseFileFilters: AdminCourseFileFilters = {
    sort: "newest",
    needs_attention: true,
    visible: "any",
    reviewed: "any",
    signals: "any",
    has_session: "any",
    has_user: "any",
    search: "",
    file_id: "",
    name: "",
    course_tag: "",
    course_name: "",
    file_type: "",
    moderation_reason_code: "",
    reviewer_user_id: "",
    session_id: "",
    user_id: "",
    size_min: "",
    size_max: "",
    download_min: "",
    download_max: "",
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
    {key: "sort", label: "Sort", options: [{label: "Newest first", value: "newest"}, {label: "Oldest first", value: "oldest"}, {label: "Largest files", value: "largest"}, {label: "Most downloads", value: "most_downloads"}, {label: "Most signals", value: "most_signals"}]},
    {key: "visible", label: "Visibility", options: [{label: "Any", value: "any"}, {label: "Visible", value: "visible"}, {label: "Hidden", value: "hidden"}]},
    {key: "reviewed", label: "Reviewed", options: [{label: "Any", value: "any"}, {label: "Reviewed", value: "reviewed"}, {label: "Not reviewed", value: "not_reviewed"}]},
    {key: "signals", label: "Signals", options: [{label: "Any", value: "any"}, {label: "Has signals", value: "has"}, {label: "No signals", value: "none"}]},
    {key: "has_session", label: "Session", options: [{label: "Any", value: "any"}, {label: "Has session", value: "has"}, {label: "No session", value: "none"}]},
    {key: "has_user", label: "User", options: [{label: "Any", value: "any"}, {label: "Has user", value: "has"}, {label: "No user", value: "none"}]},
];

const textFilters: { key: SelectFilterKey; label: string; placeholder?: string }[] = [
    {key: "search", label: "Search", placeholder: "Name, course, type, ID, note"},
    {key: "file_id", label: "File ID"},
    {key: "name", label: "File name"},
    {key: "course_tag", label: "Course tag"},
    {key: "course_name", label: "Course name"},
    {key: "file_type", label: "MIME type"},
    {key: "moderation_reason_code", label: "Reason code"},
    {key: "reviewer_user_id", label: "Reviewer ID"},
    {key: "session_id", label: "Session ID"},
    {key: "user_id", label: "User ID"},
];

const rangeFilters: { label: string; minKey: SelectFilterKey; maxKey: SelectFilterKey; type?: "number" | "date" }[] = [
    {label: "Size", minKey: "size_min", maxKey: "size_max", type: "number"},
    {label: "Downloads", minKey: "download_min", maxKey: "download_max", type: "number"},
    {label: "Created", minKey: "created_from", maxKey: "created_to", type: "date"},
    {label: "Reviewed at", minKey: "reviewed_from", maxKey: "reviewed_to", type: "date"},
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

export function CourseFilesPage() {
    const [files, setFiles] = useState<AdminCourseFileSummary[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filters, setFilters] = useState<AdminCourseFileFilters>(defaultCourseFileFilters);
    const [draftFilters, setDraftFilters] = useState<AdminCourseFileFilters>(defaultCourseFileFilters);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
    const [bulkReason, setBulkReason] = useState("");
    const [bulkNote, setBulkNote] = useState("");
    const [bulkPendingAction, setBulkPendingAction] = useState<BulkCourseFileAction | null>(null);
    const [bulkMessage, setBulkMessage] = useState("");
    const [bulkError, setBulkError] = useState("");
    const [bulkActionMessage, setBulkActionMessage] = useState("");
    const [panelFile, setPanelFile] = useState<AdminCourseFileSummary | null>(null);
    const {reasons} = useAdminEntityDrawer();

    const loadFiles = useCallback((mode: "initial" | "refresh" = "initial") => {
        const controller = new AbortController();
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError(null);

        listAdminCourseFiles(controller.signal, filters)
            .then(response => {
                setFiles(response.files.filter(file => courseFileMatchesFilters(file, filters)));
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                if (err instanceof AdminApiError) {
                    setError(err.message);
                    return;
                }
                setError("Could not load course files.");
            })
            .finally(() => setIsRefreshing(false));

        return () => controller.abort();
    }, [filters]);

    useEffect(() => loadFiles("initial"), [loadFiles]);

    const overlayOpen = filtersOpen || bulkActionsOpen || Boolean(panelFile);

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
        function onFileUpdated(event: Event) {
            const file = (event as CustomEvent<AdminCourseFileSummary>).detail;
            setFiles(current => {
                const next = current.filter(item => item.id !== file.id);
                if (courseFileMatchesFilters(file, filters)) {
                    next.push(file);
                }
                return next;
            });
            setPanelFile(current => current?.id === file.id ? file : current);
        }

        window.addEventListener("admin-course-file-updated", onFileUpdated);
        return () => window.removeEventListener("admin-course-file-updated", onFileUpdated);
    }, [filters]);

    const orderedFiles = useMemo(() => sortCourseFiles(files, filters.sort), [files, filters.sort]);
    const visibleFileIds = useMemo(() => orderedFiles.map(file => file.id), [orderedFiles]);
    const selectedVisibleCount = visibleFileIds.filter(id => selectedFileIds.has(id)).length;
    const allVisibleFilesSelected = visibleFileIds.length > 0 && selectedVisibleCount === visibleFileIds.length;
    const reasonOptions = useMemo(() => activeReasonOptions(reasons), [reasons]);
    const defaultFiltersSelected = filtersEqual(filters, defaultCourseFileFilters);
    const appliedFilterChips = useMemo(() => filterChips(filters), [filters]);
    const draftFilterCount = countActiveFilters(draftFilters);
    const draftDirty = !filtersEqual(draftFilters, filters);

    useEffect(() => {
        setBulkReason(current => (
            current && reasonOptions.some(reason => reason.code === current)
                ? current
                : reasonOptions[0]?.code || ""
        ));
    }, [reasonOptions]);

    useEffect(() => {
        const ids = new Set(files.map(file => file.id));
        setSelectedFileIds(current => {
            const next = new Set([...current].filter(id => ids.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [files]);

    function updateFilter<K extends CourseFileFilterKey>(key: K, value: AdminCourseFileFilters[K]) {
        setDraftFilters(current => ({...current, [key]: value}));
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

    function applyFilters() {
        setFilters({...draftFilters});
        setSelectedFileIds(new Set());
        setSelectedId(null);
        setPanelFile(null);
        setFiltersOpen(false);
    }

    function cancelFilters() {
        setDraftFilters(filters);
        setFiltersOpen(false);
    }

    function toggleVisibleSelection() {
        setBulkActionMessage("");
        setSelectedFileIds(current => {
            const next = new Set(current);
            if (allVisibleFilesSelected) {
                visibleFileIds.forEach(id => next.delete(id));
            } else {
                visibleFileIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    function toggleFileSelection(fileId: string, checked: boolean) {
        setBulkActionMessage("");
        setSelectedFileIds(current => {
            const next = new Set(current);
            if (checked) {
                next.add(fileId);
            } else {
                next.delete(fileId);
            }
            return next;
        });
    }

    function clearSelection() {
        setBulkActionMessage("");
        setSelectedFileIds(new Set());
    }

    function openFile(file: AdminCourseFileSummary) {
        setSelectedId(file.id);
        setPanelFile(file);
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

    async function runBulkAction(action: BulkCourseFileAction) {
        const targetIds = orderedFiles
            .map(file => file.id)
            .filter(id => selectedFileIds.has(id));
        if (targetIds.length === 0) return;
        if (action === "hide" && !bulkReason) {
            setBulkError("Choose a reason before hiding files.");
            return;
        }

        setBulkPendingAction(action);
        setBulkMessage("");
        setBulkError("");

        const failedIds: string[] = [];
        let successCount = 0;

        for (const fileId of targetIds) {
            try {
                const response = action === "note"
                    ? await saveCourseFileNote(fileId, {note: bulkNote})
                    : await setCourseFileVisibility(fileId, {
                        visible: action === "approve",
                        reason_code: bulkReason || undefined,
                        note: bulkNote || undefined,
                    });
                emitCourseFileUpdated(response.file);
                successCount += 1;
            } catch {
                failedIds.push(fileId);
            }
        }

        setBulkPendingAction(null);

        if (failedIds.length > 0) {
            setSelectedFileIds(new Set(failedIds));
            setBulkMessage(successCount > 0 ? `${successCount} files updated.` : "");
            setBulkError(`${failedIds.length} files failed. They are still selected.`);
            return;
        }

        const label = action === "hide" ? "hidden" : action === "approve" ? "approved" : "updated";
        setSelectedFileIds(new Set());
        setBulkActionMessage(`${successCount} files ${label}.`);
        setBulkActionsOpen(false);
    }

    return (
        <div className={styles.page}>
            <div className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Course files</p>
                    <h1 className={styles.title}>File review queue</h1>
                </div>
                <div className={styles.introActions}>
                    {isRefreshing && <span className={cn(styles.previewNote, styles.refreshingNote)}>Refreshing</span>}
                    <Button className={styles.refreshButton} disabled={isRefreshing} type="button" variant="outline" onClick={() => loadFiles("refresh")}>
                        {isRefreshing ? <LoaderCircle className={styles.spin} size={16}/> : <RefreshCw size={16}/>}
                        Refresh
                    </Button>
                </div>
            </div>

            <section className={styles.filters}>
                <div className={styles.filterBar}>
                    <button className={cn(styles.filterSummaryButton, filtersOpen && styles.filterSummaryOpen)} type="button" onClick={toggleFilters}>
                        <Filter size={15}/>
                        <span>Filters</span>
                        <Badge className={styles.filterCountBadge} variant={defaultFiltersSelected ? "info" : "warning"}>
                            {defaultFiltersSelected ? "Default" : `${appliedFilterChips.length} active`}
                        </Badge>
                    </button>
                    <div className={styles.appliedChips} aria-label="Applied filters">
                        {appliedFilterChips.slice(0, 5).map(chip => (
                            <span key={chip.key} title={chip.label}>{chip.label}</span>
                        ))}
                        {appliedFilterChips.length > 5 && <span>+{appliedFilterChips.length - 5}</span>}
                    </div>
                    <div className={styles.filterBarActions}>
                        <Button disabled={defaultFiltersSelected} size="sm" type="button" variant="ghost" onClick={() => setFilters(defaultCourseFileFilters)}>
                            <RotateCcw size={15}/>
                            Reset
                        </Button>
                    </div>
                </div>

                {filtersOpen && createPortal((
                    <div className={styles.filterSheetLayer}>
                        <button aria-label="Close filters" className={styles.filterSheetBackdrop} type="button" onClick={cancelFilters}/>
                        <aside className={styles.filterSheet} aria-label="Course file filters">
                            <header className={styles.filterSheetHeader}>
                                <div>
                                    <span><Filter size={14}/> Filters</span>
                                    <h2>Course file queue</h2>
                                    <p>{draftDirty ? `${draftFilterCount} selected fields` : "No unapplied changes"}</p>
                                </div>
                                <Button size="icon" type="button" variant="ghost" aria-label="Close filters" onClick={cancelFilters}>
                                    <X size={17}/>
                                </Button>
                            </header>
                            <div className={styles.bulkSheetBody}>
                                <label className={cn(styles.filterToggle, draftFilters.needs_attention && styles.filterActive)}>
                                    <input
                                        checked={draftFilters.needs_attention}
                                        type="checkbox"
                                        onChange={event => updateFilter("needs_attention", event.target.checked)}
                                    />
                                    Needs attention
                                </label>
                                <FilterGroup title="State">
                                    <div className={styles.fieldGrid}>
                                        {stateFilters.map(filter => (
                                            <label className={styles.filterField} key={filter.key}>
                                                <span>{filter.label}</span>
                                                <select
                                                    className={styles.selectInput}
                                                    value={draftFilters[filter.key]}
                                                    onChange={event => updateFilter(filter.key, event.target.value as AdminCourseFileFilters[typeof filter.key])}
                                                >
                                                    {filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </FilterGroup>
                                <FilterGroup title="Text and IDs">
                                    <div className={styles.fieldGrid}>
                                        {textFilters.map(filter => (
                                            <label className={styles.filterField} key={filter.key}>
                                                <span>{filter.label}</span>
                                                <Input
                                                    placeholder={filter.placeholder}
                                                    value={draftFilters[filter.key] as string}
                                                    onChange={event => updateFilter(filter.key, event.target.value as AdminCourseFileFilters[typeof filter.key])}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </FilterGroup>
                                <FilterGroup title="Ranges">
                                    <div className={styles.rangeGrid}>
                                        {rangeFilters.map(filter => (
                                            <div className={styles.rangeField} key={`${filter.minKey}-${filter.maxKey}`}>
                                                <span>{filter.label}</span>
                                                <Input
                                                    aria-label={`${filter.label} minimum`}
                                                    type={filter.type || "text"}
                                                    value={draftFilters[filter.minKey] as string}
                                                    onChange={event => updateFilter(filter.minKey, event.target.value as AdminCourseFileFilters[typeof filter.minKey])}
                                                />
                                                <Input
                                                    aria-label={`${filter.label} maximum`}
                                                    type={filter.type || "text"}
                                                    value={draftFilters[filter.maxKey] as string}
                                                    onChange={event => updateFilter(filter.maxKey, event.target.value as AdminCourseFileFilters[typeof filter.maxKey])}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </FilterGroup>
                            </div>
                            <footer className={styles.filterSheetFooter}>
                                <Button disabled={filtersEqual(draftFilters, defaultCourseFileFilters)} size="sm" type="button" variant="outline" onClick={() => setDraftFilters(defaultCourseFileFilters)}>
                                    Reset
                                </Button>
                                <Button size="sm" type="button" variant="ghost" onClick={cancelFilters}>
                                    Cancel
                                </Button>
                                <Button disabled={!draftDirty} size="sm" type="button" onClick={applyFilters}>
                                    Apply filters
                                </Button>
                            </footer>
                        </aside>
                    </div>
                ), document.body)}
            </section>

            {orderedFiles.length > 0 && (
                <section className={styles.selectionBar} aria-label="Course file selection">
                    <label className={styles.selectionToggle}>
                        <input
                            checked={allVisibleFilesSelected}
                            type="checkbox"
                            onChange={toggleVisibleSelection}
                        />
                        <span>{selectedFileIds.size > 0 ? `${selectedFileIds.size} selected` : `${orderedFiles.length} files in queue`}</span>
                    </label>
                    <div className={styles.selectionActions}>
                        {selectedFileIds.size > 0 && (
                            <Button size="sm" type="button" variant="ghost" onClick={clearSelection}>
                                Clear
                            </Button>
                        )}
                        <Button disabled={selectedFileIds.size === 0} size="sm" type="button" onClick={openBulkActions}>
                            <ShieldAlert size={15}/>
                            Review selected
                        </Button>
                    </div>
                    {bulkActionMessage && <span className={styles.bulkStatus}>{bulkActionMessage}</span>}
                </section>
            )}

            {bulkActionsOpen && createPortal((
                <div className={styles.filterSheetLayer}>
                    <button aria-label="Close bulk actions" className={styles.filterSheetBackdrop} type="button" onClick={closeBulkActions}/>
                    <aside className={styles.filterSheet} aria-label="Bulk course file actions">
                        <header className={styles.filterSheetHeader}>
                            <div>
                                <span><ShieldAlert size={14}/> Bulk review</span>
                                <h2>{selectedFileIds.size} selected files</h2>
                                <p>Apply one moderation decision to the selected course files.</p>
                            </div>
                            <Button disabled={Boolean(bulkPendingAction)} size="icon" type="button" variant="ghost" aria-label="Close bulk actions" onClick={closeBulkActions}>
                                <X size={17}/>
                            </Button>
                        </header>
                        <div className={styles.bulkSheetBody}>
                            {bulkMessage && <p className={styles.bulkSuccess}>{bulkMessage}</p>}
                            {bulkError && <p className={styles.bulkError}>{bulkError}</p>}
                            <FilterGroup title="Decision details">
                                <label className={styles.filterField}>
                                    <span>Reason</span>
                                    <select
                                        className={styles.selectInput}
                                        disabled={reasonOptions.length === 0 || Boolean(bulkPendingAction)}
                                        value={bulkReason}
                                        onChange={event => setBulkReason(event.target.value)}
                                    >
                                        {reasonOptions.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                                    </select>
                                </label>
                                <label className={styles.filterField}>
                                    <span>Note</span>
                                    <Textarea
                                        className={styles.bulkNote}
                                        disabled={Boolean(bulkPendingAction)}
                                        value={bulkNote}
                                        onChange={event => setBulkNote(event.target.value)}
                                    />
                                </label>
                            </FilterGroup>
                        </div>
                        <footer className={styles.filterSheetFooter}>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="ghost" onClick={closeBulkActions}>
                                Cancel
                            </Button>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="outline" onClick={() => void runBulkAction("note")}>
                                {bulkPendingAction === "note" ? <LoaderCircle className={styles.spin} size={15}/> : <StickyNote size={15}/>}
                                Save note
                            </Button>
                            <Button disabled={Boolean(bulkPendingAction)} size="sm" type="button" variant="outline" onClick={() => void runBulkAction("approve")}>
                                {bulkPendingAction === "approve" ? <LoaderCircle className={styles.spin} size={15}/> : <CheckCircle2 size={15}/>}
                                Approve selected
                            </Button>
                            <Button disabled={!bulkReason || Boolean(bulkPendingAction)} size="sm" type="button" variant="destructive" onClick={() => void runBulkAction("hide")}>
                                {bulkPendingAction === "hide" ? <LoaderCircle className={styles.spin} size={15}/> : <EyeOff size={15}/>}
                                Hide selected
                            </Button>
                        </footer>
                    </aside>
                </div>
            ), document.body)}

            {panelFile && createPortal((
                <CourseFilePanel
                    file={panelFile}
                    reasonOptions={reasonOptions}
                    onClose={() => setPanelFile(null)}
                />
            ), document.body)}

            <section className={cn(styles.reviewFeed, isRefreshing && styles.refreshingFeed)}>
                {loadState === "loading" && files.length === 0 && <SkeletonList/>}
                {loadState === "error" && files.length === 0 && (
                    <div className={cn(styles.stateNotice, styles.errorNotice)}>
                        <AlertCircle size={20}/>
                        <div>
                            <strong>Course files could not be loaded</strong>
                            <span>{error || "The admin service did not return a usable response."}</span>
                        </div>
                        <Button type="button" variant="outline" onClick={() => loadFiles("initial")}>
                            <RefreshCw size={16}/>
                            Refresh
                        </Button>
                    </div>
                )}
                {loadState === "ready" && orderedFiles.length === 0 && (
                    <div className={styles.stateNotice}>
                        <CheckCircle2 size={20}/>
                        <div>
                            <strong>{defaultFiltersSelected ? "No course files need attention" : "No course files match these filters"}</strong>
                            <span>{defaultFiltersSelected ? "New uploads or files with moderation signals will appear here." : "Change the selected filters or refresh the queue."}</span>
                        </div>
                    </div>
                )}
                {orderedFiles.length > 0 && (
                    <div className={styles.queue}>
                        {orderedFiles.map(file => (
                            <CourseFileQueueItem
                                key={file.id}
                                file={file}
                                selected={file.id === selectedId}
                                selectedForBatch={selectedFileIds.has(file.id)}
                                onOpen={() => openFile(file)}
                                onSelectionChange={checked => toggleFileSelection(file.id, checked)}
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

function CourseFileQueueItem({
    file,
    selected,
    selectedForBatch,
    onOpen,
    onSelectionChange,
}: {
    file: AdminCourseFileSummary;
    selected: boolean;
    selectedForBatch: boolean;
    onOpen: () => void;
    onSelectionChange: (checked: boolean) => void;
}) {
    const status = courseFileStatus(file);
    const signalCount = courseFileSignalCount(file);

    function onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
        }
    }

    return (
        <article
            aria-label={`Open course file ${file.id}`}
            className={cn(styles.reviewRow, selected && styles.selected, selectedForBatch && styles.batchSelected)}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={onKeyDown}
        >
            <div className={styles.queueReview}>
                <label
                    className={styles.reviewSelector}
                    aria-label={`Select course file ${file.id}`}
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
                        <strong>{file.name}</strong>
                        <span>#{file.id}</span>
                        <span>{file.course_tag}</span>
                        <span>{formatDateTime(file.created_at)}</span>
                    </div>
                    <div className={styles.queueState}>
                        <Badge
                            aria-label={status.label}
                            className={cn(styles.compactBadge, styles.iconBadge)}
                            title={status.label}
                            variant={status.tone}
                        >
                            {file.visible ? <Eye size={13}/> : <EyeOff size={13}/>}
                        </Badge>
                        <Badge
                            aria-label={file.reviewed ? "Reviewed" : "Not reviewed"}
                            className={cn(styles.compactBadge, styles.iconBadge)}
                            title={file.reviewed ? "Reviewed" : "Not reviewed"}
                            variant={file.reviewed ? "success" : "warning"}
                        >
                            {file.reviewed ? <CheckCircle2 size={13}/> : <StickyNote size={13}/>}
                        </Badge>
                        <Badge className={styles.compactBadge} title={file.type} variant="info">{mimeLabel(file.type)}</Badge>
                        <Badge className={styles.compactBadge} variant="default">{formatBytes(file.size)}</Badge>
                        {file.download_count > 0 && <Badge className={styles.compactBadge} variant="success">{file.download_count} downloads</Badge>}
                        {signalCount > 0 && <Badge className={styles.compactBadge} variant="danger">{signalCount} signals</Badge>}
                    </div>
                    <p className={styles.queueText}>{file.course_name || file.course_tag}</p>
                    <div className={styles.queueMeta}>
                        {file.session_id && <span><EntityLink target={{type: "session", id: file.session_id}}>Session {file.session_id}</EntityLink></span>}
                        {file.user_id && <span><EntityLink target={{type: "user", id: file.user_id}}>User {file.user_id}</EntityLink></span>}
                        {file.moderation_reason_code && <span>{file.moderation_reason_code}</span>}
                        {file.moderation_note && <span>{file.moderation_note}</span>}
                    </div>
                </div>
            </div>
        </article>
    );
}

function CourseFilePanel({
    file,
    reasonOptions,
    onClose,
}: {
    file: AdminCourseFileSummary;
    reasonOptions: AdminReason[];
    onClose: () => void;
}) {
    const [reason, setReason] = useState("");
    const [note, setNote] = useState(file.moderation_note || "");
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        setNote(file.moderation_note || "");
    }, [file.id, file.moderation_note]);

    useEffect(() => {
        setReason(current => (
            current && reasonOptions.some(option => option.code === current)
                ? current
                : file.moderation_reason_code || reasonOptions[0]?.code || ""
        ));
    }, [file.moderation_reason_code, reasonOptions]);

    async function runAction(action: string, callback: () => Promise<AdminCourseFileSummary>, successMessage: string) {
        setPendingAction(action);
        setMessage("");
        setError("");
        try {
            const updated = await callback();
            emitCourseFileUpdated(updated);
            setMessage(successMessage);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setPendingAction(null);
        }
    }

    const signalCount = courseFileSignalCount(file);
    const actions = file.action_history || [];

    return (
        <div className={styles.filterSheetLayer}>
            <button aria-label="Close course file details" className={styles.filterSheetBackdrop} type="button" onClick={onClose}/>
            <aside className={styles.filterSheet} aria-label="Course file details">
                <header className={styles.filterSheetHeader}>
                    <div>
                        <span><FileText size={14}/> Course file</span>
                        <h2>{file.name}</h2>
                        <p>{file.course_name || file.course_tag} * #{file.id}</p>
                    </div>
                    <Button disabled={Boolean(pendingAction)} size="icon" type="button" variant="ghost" aria-label="Close course file details" onClick={onClose}>
                        <X size={17}/>
                    </Button>
                </header>
                <div className={styles.bulkSheetBody}>
                    {message && <p className={styles.actionMessage}>{message}</p>}
                    {error && <p className={styles.actionError}>{error}</p>}
                    <div className={styles.stateGrid}>
                        <Field label="Visibility" value={file.visible ? "Visible" : "Hidden"}/>
                        <Field label="Reviewed" value={file.reviewed ? "Reviewed" : "Not reviewed"}/>
                        <Field label="Type" value={file.type}/>
                        <Field label="Size" value={formatBytes(file.size)}/>
                        <Field label="Downloads" value={String(file.download_count)}/>
                        <Field label="Created" value={formatDateTime(file.created_at)}/>
                        <Field label="Reviewed at" value={formatDateTime(file.reviewed_at) || "Never"}/>
                        <Field label="Reviewer" value={file.reviewer_user_id ? `User ${file.reviewer_user_id}` : "None"}/>
                        <Field label="Blob" value={file.blob_name || "None"}/>
                        <Field label="Signals" value={String(signalCount)}/>
                    </div>
                    <div className={styles.relatedPanel}>
                        <div className={styles.boxHead}>
                            <span>Identity</span>
                        </div>
                        <div className={styles.replyMeta}>
                            <span>{file.course_tag}</span>
                            {file.session_id && <span><EntityLink target={{type: "session", id: file.session_id}}>Session {file.session_id}</EntityLink></span>}
                            {file.user_id && <span><EntityLink target={{type: "user", id: file.user_id}}>User {file.user_id}</EntityLink></span>}
                        </div>
                        {file.url && (
                            <div className={styles.mediaActions}>
                                <Button asChild size="sm" type="button" variant="outline">
                                    <a href={file.url} target="_blank" rel="noreferrer">
                                        <Download size={15}/>
                                        Open file
                                    </a>
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className={styles.relatedPanel}>
                        <div className={styles.boxHead}>
                            <span>Signals</span>
                            <Badge className={styles.compactBadge} variant={signalCount > 0 ? "danger" : "info"}>{signalCount}</Badge>
                        </div>
                        {(file.signals || []).length > 0 ? (
                            <div className={styles.reportList}>
                                {(file.signals || []).map(signal => (
                                    <div className={styles.reportItem} key={signal.id || `${signal.source}-${signal.attribute}-${signal.created_at}`}>
                                        <div>
                                            <strong>{signal.attribute}</strong>
                                            <span>{signal.source} * {formatDateTime(signal.created_at)}</span>
                                        </div>
                                        <div className={styles.sideNote}>
                                            {signal.severity && <span>{signal.severity}</span>}
                                            {signal.score !== undefined && <span>Score {signal.score}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className={styles.emptyLine}>No moderation signals recorded.</p>}
                    </div>
                    <div className={styles.relatedPanel}>
                        <div className={styles.boxHead}>
                            <span>Action history</span>
                            <Badge className={styles.compactBadge} variant="info">{actions.length}</Badge>
                        </div>
                        {actions.length > 0 ? (
                            <div className={styles.reportList}>
                                {actions.map(action => (
                                    <div className={styles.reportItem} key={action.id}>
                                        <div>
                                            <strong>{action.action}</strong>
                                            <span>{formatDateTime(action.created_at)}</span>
                                        </div>
                                        <div className={styles.sideNote}>
                                            {action.reason_code && <span>{action.reason_code}</span>}
                                            {action.note && <span>{action.note}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className={styles.emptyLine}>No action history recorded.</p>}
                    </div>
                    <FilterGroup title="Decision">
                        <label className={styles.filterField}>
                            <span>Reason</span>
                            <select
                                className={styles.selectInput}
                                disabled={reasonOptions.length === 0 || Boolean(pendingAction)}
                                value={reason}
                                onChange={event => setReason(event.target.value)}
                            >
                                {reasonOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
                            </select>
                        </label>
                        <label className={styles.filterField}>
                            <span>Note</span>
                            <Textarea
                                className={styles.bulkNote}
                                disabled={Boolean(pendingAction)}
                                value={note}
                                onChange={event => setNote(event.target.value)}
                            />
                        </label>
                    </FilterGroup>
                </div>
                <footer className={styles.filterSheetFooter}>
                    <Button disabled={Boolean(pendingAction)} size="sm" type="button" variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                    <Button disabled={Boolean(pendingAction)} size="sm" type="button" variant="outline" onClick={() => {
                        void runAction("save-note", async () => {
                            const response = await saveCourseFileNote(file.id, {note});
                            return response.file;
                        }, "Note saved.");
                    }}>
                        {pendingAction === "save-note" ? <LoaderCircle className={styles.spin} size={15}/> : <StickyNote size={15}/>}
                        Save note
                    </Button>
                    <Button disabled={Boolean(pendingAction)} size="sm" type="button" variant="outline" onClick={() => {
                        void runAction("approve", async () => {
                            const response = await setCourseFileVisibility(file.id, {visible: true, reason_code: reason || undefined, note: note || undefined});
                            return response.file;
                        }, "File approved.");
                    }}>
                        {pendingAction === "approve" ? <LoaderCircle className={styles.spin} size={15}/> : <CheckCircle2 size={15}/>}
                        Approve
                    </Button>
                    <Button disabled={!reason || Boolean(pendingAction)} size="sm" type="button" variant="destructive" onClick={() => {
                        void runAction("hide", async () => {
                            const response = await setCourseFileVisibility(file.id, {visible: false, reason_code: reason || undefined, note: note || undefined});
                            return response.file;
                        }, "File hidden.");
                    }}>
                        {pendingAction === "hide" ? <LoaderCircle className={styles.spin} size={15}/> : <EyeOff size={15}/>}
                        Hide
                    </Button>
                </footer>
            </aside>
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

function courseFileStatus(file: AdminCourseFileSummary): { label: string; tone: Tone } {
    if (file.visible) return {label: "Visible to users", tone: "success"};
    if (!file.reviewed) return {label: "Pending review", tone: "warning"};
    return {label: "Hidden from users", tone: "danger"};
}

function sortCourseFiles(files: AdminCourseFileSummary[], sort: AdminCourseFileFilters["sort"]) {
    return [...files].sort((a, b) => {
        switch (sort) {
        case "oldest":
            return timestamp(a.created_at) - timestamp(b.created_at) || a.id.localeCompare(b.id);
        case "largest":
            return b.size - a.size || timestamp(b.created_at) - timestamp(a.created_at);
        case "most_downloads":
            return b.download_count - a.download_count || timestamp(b.created_at) - timestamp(a.created_at);
        case "most_signals":
            return courseFileSignalCount(b) - courseFileSignalCount(a) || timestamp(b.created_at) - timestamp(a.created_at);
        default:
            return timestamp(b.created_at) - timestamp(a.created_at) || b.id.localeCompare(a.id);
        }
    });
}

function courseFileMatchesFilters(file: AdminCourseFileSummary, filters: AdminCourseFileFilters) {
    if (filters.needs_attention && !isCourseFileInDefaultQueue(file)) return false;

    if (!matchesChoice(filters.visible, file.visible, "visible", "hidden")) return false;
    if (!matchesChoice(filters.reviewed, file.reviewed, "reviewed", "not_reviewed")) return false;
    if (!matchesCountState(filters.signals, courseFileSignalCount(file))) return false;
    if (!matchesPresence(filters.has_session, file.session_id)) return false;
    if (!matchesPresence(filters.has_user, file.user_id)) return false;

    if (filters.search && !containsAny(filters.search, [
        file.id,
        file.name,
        file.type,
        file.course_tag,
        file.course_name,
        file.blob_name,
        file.moderation_reason_code,
        file.moderation_note,
        file.session_id,
        file.user_id,
    ])) return false;

    if (!matchesExact(filters.file_id, file.id)) return false;
    if (!containsText(filters.name, file.name)) return false;
    if (!containsText(filters.course_tag, file.course_tag)) return false;
    if (!containsText(filters.course_name, file.course_name)) return false;
    if (!containsText(filters.file_type, file.type)) return false;
    if (!matchesExactText(filters.moderation_reason_code, file.moderation_reason_code)) return false;
    if (!matchesExact(filters.reviewer_user_id, file.reviewer_user_id)) return false;
    if (!matchesExact(filters.session_id, file.session_id)) return false;
    if (!matchesExact(filters.user_id, file.user_id)) return false;

    if (!matchesNumberRange(file.size, filters.size_min, filters.size_max)) return false;
    if (!matchesNumberRange(file.download_count, filters.download_min, filters.download_max)) return false;
    if (!matchesDateRange(file.created_at, filters.created_from, filters.created_to)) return false;
    if (!matchesDateRange(file.reviewed_at, filters.reviewed_from, filters.reviewed_to)) return false;

    return true;
}

function isCourseFileInDefaultQueue(file: AdminCourseFileSummary) {
    return !file.reviewed || courseFileSignalCount(file) > 0;
}

function courseFileSignalCount(file: AdminCourseFileSummary) {
    return file.signals?.length ?? file.signal_count ?? 0;
}

function filtersEqual(a: AdminCourseFileFilters, b: AdminCourseFileFilters) {
    return (Object.keys(defaultCourseFileFilters) as CourseFileFilterKey[]).every(key => a[key] === b[key]);
}

function filterChips(filters: AdminCourseFileFilters) {
    const chips: { key: string; label: string }[] = [];
    if (filters.needs_attention) {
        chips.push({key: "needs_attention", label: "Needs attention"});
    }
    for (const filter of stateFilters) {
        if (filters[filter.key] !== defaultCourseFileFilters[filter.key]) {
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
        chips.push({key: "all-files", label: "All files"});
    }
    return chips;
}

function countActiveFilters(filters: AdminCourseFileFilters) {
    return (Object.keys(defaultCourseFileFilters) as CourseFileFilterKey[]).filter(key => filters[key] !== defaultCourseFileFilters[key]).length + (filters.needs_attention ? 1 : 0);
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
    if (!needle) return true;
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

function mimeLabel(value: string) {
    const lower = value.toLowerCase();
    if (lower.includes("pdf")) return "PDF";
    if (lower.includes("word") || lower.includes("document")) return "DOC";
    if (lower.includes("presentation") || lower.includes("powerpoint")) return "PPT";
    if (lower.includes("spreadsheet") || lower.includes("excel")) return "XLS";
    if (lower.includes("zip")) return "ZIP";
    return value.split("/").pop()?.slice(0, 8).toUpperCase() || "FILE";
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
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

function emitCourseFileUpdated(file: AdminCourseFileSummary) {
    window.dispatchEvent(new CustomEvent<AdminCourseFileSummary>("admin-course-file-updated", {detail: file}));
}
