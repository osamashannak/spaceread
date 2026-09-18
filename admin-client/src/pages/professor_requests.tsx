import {
    type FormEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {createPortal} from "react-dom";
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    CopyCheck,
    History,
    Link2,
    LoaderCircle,
    RefreshCw,
    Search,
    ShieldAlert,
    Sparkles,
    UserRoundPlus,
    X,
    XCircle,
} from "lucide-react";
import {EntityLink, useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";
import {
    AdminApiError,
    type AdminProfessorMatch,
    type AdminProfessorRequest,
    type AdminProfessorRequestDecision,
    type AdminProfessorRequestDuplicateCounts,
    type AdminProfessorRequestDuplicateFilter,
    type AdminProfessorRequestStatusCounts,
    type AdminProfessorRequestStatusFilter,
    type AdminReason,
    decideAdminProfessorRequest,
    getAdminProfessorRequest,
    listAdminProfessorRequests,
} from "@/lib/admin_api";
import {cn} from "@/lib/utils";
import styles from "./professor_requests.module.scss";

type LoadState = "loading" | "ready" | "error";
type LoadMode = "initial" | "refresh";
type DetailState = "loading" | "ready" | "error";
type RecommendationKind = "ready" | "details" | "duplicate";
type ProfessorRequestGroup = {
    id: string;
    requests: AdminProfessorRequest[];
    total: number;
};

const pageSize = 100;
const emptyCounts: AdminProfessorRequestStatusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    dismissed: 0,
    all: 0,
};

const emptyDuplicateCounts: AdminProfessorRequestDuplicateCounts = {
    all: 0,
    likely: 0,
    not_likely: 0,
};

const statusTabs: {value: AdminProfessorRequestStatusFilter; label: string}[] = [
    {value: "pending", label: "Pending"},
    {value: "all", label: "All"},
    {value: "approved", label: "Approved"},
    {value: "rejected", label: "Rejected"},
    {value: "dismissed", label: "Dismissed"},
];

const duplicateTabs: {value: AdminProfessorRequestDuplicateFilter; label: string}[] = [
    {value: "all", label: "All"},
    {value: "likely", label: "Likely duplicate"},
    {value: "not_likely", label: "Not likely duplicate"},
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

export function ProfessorRequestsPage() {
    const [requests, setRequests] = useState<AdminProfessorRequest[]>([]);
    const [counts, setCounts] = useState<AdminProfessorRequestStatusCounts>(emptyCounts);
    const [duplicateCounts, setDuplicateCounts] = useState<AdminProfessorRequestDuplicateCounts>(emptyDuplicateCounts);
    const [total, setTotal] = useState(0);
    const [groupTotal, setGroupTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [status, setStatus] = useState<AdminProfessorRequestStatusFilter>("pending");
    const [duplicate, setDuplicate] = useState<AdminProfessorRequestDuplicateFilter>("all");
    const [searchDraft, setSearchDraft] = useState("");
    const [search, setSearch] = useState("");
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [selectedRequest, setSelectedRequest] = useState<AdminProfessorRequest | null>(null);
    const [detailState, setDetailState] = useState<DetailState>("loading");
    const [detailError, setDetailError] = useState("");
    const listControllerRef = useRef<AbortController | null>(null);
    const detailControllerRef = useRef<AbortController | null>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const dialogRef = useRef<HTMLElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const {reasons} = useAdminEntityDrawer();

    const loadRequests = useCallback((mode: LoadMode, requestedOffset: number) => {
        listControllerRef.current?.abort();
        const controller = new AbortController();
        listControllerRef.current = controller;

        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }
        setError("");

        listAdminProfessorRequests(controller.signal, {
            status,
            duplicate,
            search,
            limit: pageSize,
            offset: requestedOffset,
        })
            .then(response => {
                setRequests((response.requests || []).map(normalizeRequest));
                setCounts({...emptyCounts, ...response.status_counts});
                setDuplicateCounts({...emptyDuplicateCounts, ...response.duplicate_counts});
                setTotal(response.total);
                setGroupTotal(response.group_total ?? response.total);
                setOffset(response.offset);
                setLoadState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setLoadState("error");
                setError(err instanceof AdminApiError ? err.message : "Could not load professor requests.");
            })
            .finally(() => {
                if (listControllerRef.current !== controller) return;
                listControllerRef.current = null;
                setIsRefreshing(false);
            });
    }, [duplicate, search, status]);

    useEffect(() => {
        setOffset(0);
        loadRequests("initial", 0);
        return () => listControllerRef.current?.abort();
    }, [loadRequests]);

    const closePanel = useCallback(() => {
        detailControllerRef.current?.abort();
        detailControllerRef.current = null;
        setSelectedRequest(null);
        setDetailError("");
        window.setTimeout(() => {
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        });
    }, []);

    useEffect(() => {
        if (!selectedRequest) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousBodyPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

        window.setTimeout(() => closeButtonRef.current?.focus());

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                closePanel();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
            )).filter(element => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            document.body.style.paddingRight = previousBodyPaddingRight;
        };
    }, [closePanel, selectedRequest]);

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const next = searchDraft.trim();
        if (next === search) {
            setOffset(0);
            loadRequests("initial", 0);
            return;
        }
        setSearch(next);
    }

    function clearSearch() {
        setSearchDraft("");
        if (search === "") {
            loadRequests("initial", 0);
            return;
        }
        setSearch("");
    }

    function openRequest(request: AdminProfessorRequest, trigger: HTMLElement) {
        returnFocusRef.current = trigger;
        setSelectedRequest(request);
        setDetailState("loading");
        setDetailError("");
        detailControllerRef.current?.abort();
        const controller = new AbortController();
        detailControllerRef.current = controller;

        getAdminProfessorRequest(request.id, controller.signal)
            .then(response => {
                setSelectedRequest(normalizeRequest(response.request));
                setDetailState("ready");
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setDetailState("error");
                setDetailError(err instanceof AdminApiError ? err.message : "Could not load request details.");
            })
            .finally(() => {
                if (detailControllerRef.current === controller) detailControllerRef.current = null;
            });
    }

    function retryDetail() {
        if (!selectedRequest) return;
        const trigger = returnFocusRef.current || document.body;
        openRequest(selectedRequest, trigger);
    }

    function handleRequestUpdated(request: AdminProfessorRequest) {
        const normalized = normalizeRequest(request);
        setSelectedRequest(normalized);
        setRequests(current => {
            const updated = current.map(item => item.id === normalized.id ? normalized : item);
            return status !== "all" && normalized.status !== status
                ? updated.filter(item => item.id !== normalized.id)
                : updated;
        });
        void loadRequests("refresh", offset);
    }

    const requestGroups = useMemo(() => groupProfessorRequests(requests), [requests]);
    const hasPrevious = offset > 0;
    const hasNext = offset + requestGroups.length < groupTotal;
    const pageStart = groupTotal === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + requestGroups.length, groupTotal);
    const activeReasons = useMemo(() => reasons
        .filter(reason => reason.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)), [reasons]);

    return (
        <div className={styles.page}>
            <header className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Requests</p>
                    <h1 className={styles.title}>Professor add requests</h1>
                    <p className={styles.description}>Review submitted details, possible matches, and supporting activity before making a decision.</p>
                </div>
                <Button disabled={isRefreshing} type="button" variant="outline" onClick={() => loadRequests("refresh", offset)}>
                    {isRefreshing ? <LoaderCircle className={styles.spin} size={16}/> : <RefreshCw size={16}/>}
                    {isRefreshing ? "Refreshing" : "Refresh"}
                </Button>
            </header>

            <section className={styles.controls} aria-label="Professor request filters">
                <div className={styles.filterControls}>
                    <div className={styles.filterSet}>
                        <span className={styles.filterLabel}>Status</span>
                        <Tabs value={status} onValueChange={value => setStatus(value as AdminProfessorRequestStatusFilter)}>
                            <TabsList className={styles.statusTabs} aria-label="Filter by request status">
                                {statusTabs.map(tab => (
                                    <TabsTrigger className={styles.statusTab} key={tab.value} value={tab.value}>
                                        <span>{tab.label}</span>
                                        <span className={styles.tabCount}>{counts[tab.value]}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className={styles.filterSet}>
                        <span className={styles.filterLabel}>Duplicate likelihood</span>
                        <Tabs value={duplicate} onValueChange={value => setDuplicate(value as AdminProfessorRequestDuplicateFilter)}>
                            <TabsList className={styles.duplicateTabs} aria-label="Filter by duplicate likelihood">
                                {duplicateTabs.map(tab => (
                                    <TabsTrigger className={styles.statusTab} key={tab.value} value={tab.value}>
                                        <span>{tab.label}</span>
                                        <span className={styles.tabCount}>{duplicateCounts[tab.value]}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
                <form className={styles.searchForm} role="search" onSubmit={submitSearch}>
                    <label className={styles.searchField}>
                        <Search aria-hidden="true" size={16}/>
                        <span className={styles.srOnly}>Search professor requests</span>
                        <Input
                            aria-label="Search professor requests"
                            placeholder="Name, email, university, college, or request ID"
                            value={searchDraft}
                            onChange={event => setSearchDraft(event.target.value)}
                        />
                    </label>
                    <Button size="sm" type="submit">Search</Button>
                    {(search || searchDraft) && (
                        <Button size="sm" type="button" variant="ghost" onClick={clearSearch}>Clear</Button>
                    )}
                </form>
            </section>

            <div className={styles.resultBar} aria-live="polite">
                <span>
                    {search ? `Results for “${search}”` : `${statusLabel(status)} requests`}
                    {` · ${duplicateFilterLabel(duplicate)}`}
                </span>
                <strong>
                    {total === 0
                        ? "No requests"
                        : `${pageStart}–${pageEnd} of ${groupTotal} ${groupTotal === 1 ? "group" : "groups"} · ${total} ${total === 1 ? "request" : "requests"}`}
                </strong>
            </div>

            <section className={styles.queue} aria-label="Professor request queue" aria-busy={loadState === "loading"}>
                {loadState === "loading" && <RequestSkeleton/>}
                {loadState === "error" && (
                    <StateNotice
                        icon={<AlertCircle size={21}/>}
                        title="Professor requests could not be loaded"
                        message={error || "The admin service did not return a usable response."}
                        action={<Button type="button" variant="outline" onClick={() => loadRequests("initial", offset)}>Retry</Button>}
                        danger
                    />
                )}
                {loadState === "ready" && requests.length === 0 && (
                    <StateNotice
                        icon={<UserRoundPlus size={22}/>}
                        title={emptyQueueTitle(search, status, duplicate)}
                        message={search
                            ? "Try a name, email, university, or request ID."
                            : duplicate === "all" ? "There is nothing in this queue right now." : "Try another status or duplicate-likelihood filter."}
                    />
                )}
                {loadState === "ready" && requestGroups.map(group => (
                    <RelatedRequestGroup
                        key={group.id}
                        group={group}
                        selectedRequestId={selectedRequest?.id}
                        onOpen={openRequest}
                    />
                ))}
            </section>

            {loadState === "ready" && (hasPrevious || hasNext) && (
                <nav className={styles.pagination} aria-label="Professor request pages">
                    <Button disabled={!hasPrevious} size="sm" type="button" variant="outline" onClick={() => loadRequests("initial", Math.max(0, offset - pageSize))}>
                        Previous
                    </Button>
                    <span>{pageStart}–{pageEnd} of {groupTotal} {groupTotal === 1 ? "group" : "groups"}</span>
                    <Button disabled={!hasNext} size="sm" type="button" variant="outline" onClick={() => loadRequests("initial", offset + pageSize)}>
                        Next
                    </Button>
                </nav>
            )}

            {selectedRequest && createPortal((
                <div className={styles.panelLayer}>
                    <button className={styles.panelBackdrop} type="button" aria-label="Close professor request details" onClick={closePanel}/>
                    <aside
                        ref={dialogRef}
                        aria-labelledby="professor-request-panel-title"
                        aria-modal="true"
                        className={styles.panel}
                        role="dialog"
                    >
                        <header className={styles.panelHeader}>
                            <div>
                                <span><UserRoundPlus size={15}/> Request #{selectedRequest.id}</span>
                                <h2 id="professor-request-panel-title" dir="auto">{selectedRequest.professor_name}</h2>
                                <p>{formatDateTime(selectedRequest.created_at)} · {selectedRequest.university}</p>
                            </div>
                            <Button ref={closeButtonRef} size="icon" type="button" variant="ghost" aria-label="Close professor request details" onClick={closePanel}>
                                <X size={17}/>
                            </Button>
                        </header>
                        {detailState === "loading" && (
                            <div className={styles.panelState} role="status">
                                <LoaderCircle className={styles.spin} size={22}/>
                                <strong>Loading request details</strong>
                            </div>
                        )}
                        {detailState === "error" && (
                            <div className={styles.panelState} role="alert">
                                <AlertCircle size={22}/>
                                <strong>Could not load request details</strong>
                                <span>{detailError}</span>
                                <Button type="button" variant="outline" onClick={retryDetail}>Try again</Button>
                            </div>
                        )}
                        {detailState === "ready" && (
                            <RequestReviewForm
                                key={selectedRequest.id}
                                reasons={activeReasons}
                                request={selectedRequest}
                                onUpdated={handleRequestUpdated}
                            />
                        )}
                    </aside>
                </div>
            ), document.body)}
        </div>
    );
}

function RelatedRequestGroup({
    group,
    selectedRequestId,
    onOpen,
}: {
    group: ProfessorRequestGroup;
    selectedRequestId?: string;
    onOpen: (request: AdminProfessorRequest, trigger: HTMLElement) => void;
}) {
    if (group.total <= 1) {
        const request = group.requests[0];
        return (
            <RequestCard
                request={request}
                selected={selectedRequestId === request.id}
                onOpen={trigger => onOpen(request, trigger)}
            />
        );
    }

    const shown = group.requests.length;
    return (
        <section className={styles.relatedGroup} aria-label={`${group.total} related professor requests`}>
            <header className={styles.relatedGroupHeader}>
                <div>
                    <strong>Related requests</strong>
                    <span>Grouped by matching email or professor name and university.</span>
                </div>
                <Badge variant="info">
                    {shown < group.total ? `${shown} shown of ${group.total} requests` : `${group.total} requests`}
                </Badge>
            </header>
            <div className={styles.relatedGroupCards}>
                {group.requests.map(request => (
                    <RequestCard
                        key={request.id}
                        request={request}
                        selected={selectedRequestId === request.id}
                        onOpen={trigger => onOpen(request, trigger)}
                    />
                ))}
            </div>
        </section>
    );
}

function RequestCard({
    request,
    selected,
    onOpen,
}: {
    request: AdminProfessorRequest;
    selected: boolean;
    onOpen: (trigger: HTMLElement) => void;
}) {
    const recommendation = recommendationFor(request);
    const completeness = completenessFor(request);
    const matches = request.matches || [];

    return (
        <article className={cn(styles.requestCard, selected && styles.requestCardSelected)}>
            <button className={styles.requestOpen} type="button" onClick={event => onOpen(event.currentTarget)}>
                <div className={styles.requestIdentity}>
                    <div className={styles.requestTitleRow}>
                        <strong dir="auto">{request.professor_name}</strong>
                        <span>#{request.id}</span>
                    </div>
                    <span className={styles.requestEmail} dir="auto">{request.professor_email || "No email supplied"}</span>
                    <div className={styles.requestLocation}>
                        <span dir="auto">{request.university}</span>
                        <span dir="auto">{request.college || "No college supplied"}</span>
                    </div>
                </div>
                <div className={styles.requestSignals}>
                    <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                    <Badge variant={recommendation.tone}>{recommendation.label}</Badge>
                    <span>{completeness.count}/4 fields</span>
                    <span>{request.related_request_count || 0} related</span>
                    <span>{matches.length} {matches.length === 1 ? "match" : "matches"}</span>
                </div>
                <div className={styles.requestTime}>
                    <Clock3 size={14}/>
                    <span>{formatDateTime(request.created_at)}</span>
                </div>
            </button>
            <footer className={styles.requestFooter}>
                <EntityLink target={{type: "session", id: request.session_id}}>Session {request.session_id}</EntityLink>
                {request.user_id
                    ? <EntityLink target={{type: "user", id: request.user_id}}>User {request.user_id}</EntityLink>
                    : <span>Anonymous user</span>}
                {(request.signals || []).length > 0 && <span>{request.signals.length} moderation signals</span>}
            </footer>
        </article>
    );
}

function RequestReviewForm({
    request,
    reasons,
    onUpdated,
}: {
    request: AdminProfessorRequest;
    reasons: AdminReason[];
    onUpdated: (request: AdminProfessorRequest) => void;
}) {
    const [professorName, setProfessorName] = useState(request.professor_name || "");
    const [professorEmail, setProfessorEmail] = useState(request.professor_email || "");
    const [university, setUniversity] = useState(request.university || "");
    const [college, setCollege] = useState(request.college || "");
    const [resolvedProfessorEmail, setResolvedProfessorEmail] = useState(request.resolved_professor_email || "");
    const [reason, setReason] = useState(request.moderation_reason_code || "");
    const [note, setNote] = useState(request.moderation_note || "");
    const [pendingDecision, setPendingDecision] = useState<AdminProfessorRequestDecision | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const matches = useMemo(() => [...(request.matches || [])].sort((a, b) => normalizedSimilarity(b.name_similarity) - normalizedSimilarity(a.name_similarity)), [request.matches]);
    const draftRequest = {
        ...request,
        professor_name: professorName,
        professor_email: professorEmail,
        university,
        college,
    };
    const completeness = completenessFor(draftRequest);
    const recommendation = recommendationFor(draftRequest);
    const requestPending = request.status === "pending";

    async function submitDecision(decision: AdminProfessorRequestDecision) {
        setError("");
        setMessage("");

        const cleaned = {
            professor_name: professorName.trim(),
            professor_email: professorEmail.trim().toLowerCase(),
            university: university.trim(),
            college: college.trim(),
            resolved_professor_email: resolvedProfessorEmail.trim().toLowerCase(),
        };

        if (decision === "approve") {
            if (!cleaned.professor_name || !cleaned.professor_email || !cleaned.university || !cleaned.college) {
                setError("Approve & add requires a final name, email, university, and college.");
                return;
            }
            if (!isValidEmail(cleaned.professor_email)) {
                setError("Enter a valid professor email before approving.");
                return;
            }
        }

        if (decision === "mark_duplicate") {
            if (!cleaned.resolved_professor_email) {
                setError("Select a candidate or enter the existing professor email before marking a duplicate.");
                return;
            }
            if (!isValidEmail(cleaned.resolved_professor_email)) {
                setError("Enter a valid existing professor email before marking a duplicate.");
                return;
            }
        }

        setPendingDecision(decision);
        try {
            const response = await decideAdminProfessorRequest(request.id, {
                decision,
                professor_name: cleaned.professor_name || undefined,
                professor_email: cleaned.professor_email || undefined,
                university: cleaned.university || undefined,
                college: cleaned.college || undefined,
                resolved_professor_email: decision === "mark_duplicate" ? cleaned.resolved_professor_email : undefined,
                reason_code: reason || undefined,
                note: note.trim() || undefined,
            });
            onUpdated(response.request);
            setMessage(decisionSuccessMessage(decision, response.action));
        } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "The decision could not be saved.");
        } finally {
            setPendingDecision(null);
        }
    }

    return (
        <div className={styles.panelBody}>
            <section className={styles.overview} aria-label="Request review summary">
                <div className={styles.overviewTop}>
                    <div>
                        <span className={styles.sectionLabel}>Current status</span>
                        <Badge variant={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                    </div>
                    <div>
                        <span className={styles.sectionLabel}>Completeness</span>
                        <strong>{completeness.count} of 4 required fields</strong>
                    </div>
                    <div>
                        <span className={styles.sectionLabel}>Related requests</span>
                        <strong>{request.related_request_count || 0}</strong>
                    </div>
                </div>
                <div className={cn(styles.recommendation, styles[`recommendation_${recommendation.kind}`])}>
                    <span className={styles.recommendationIcon}>{recommendation.icon}</span>
                    <div>
                        <strong>{recommendation.label}</strong>
                        <p>{recommendation.description}</p>
                    </div>
                </div>
                <p className={styles.advisory}><Sparkles size={13}/> Advisory only — no action is automatic.</p>
            </section>

            <PanelSection title="Final professor details" subtitle="Review and correct the values that will be used for approval.">
                <div className={styles.fieldGrid}>
                    <PanelField label="Final name" hint="Required to approve">
                        <Input dir="auto" maxLength={120} value={professorName} onChange={event => setProfessorName(event.target.value)}/>
                    </PanelField>
                    <PanelField label="Final email" hint="Required to approve">
                        <Input autoCapitalize="none" inputMode="email" maxLength={254} value={professorEmail} onChange={event => setProfessorEmail(event.target.value)}/>
                    </PanelField>
                    <PanelField label="University" hint="Required to approve">
                        <Input dir="auto" maxLength={120} value={university} onChange={event => setUniversity(event.target.value)}/>
                    </PanelField>
                    <PanelField label="College" hint="Required to approve">
                        <Input dir="auto" maxLength={500} value={college} onChange={event => setCollege(event.target.value)}/>
                    </PanelField>
                </div>
                {completeness.missing.length > 0 && (
                    <p className={styles.inlineHint}>Still needed for approval: {completeness.missing.join(", ")}.</p>
                )}
                {professorEmail.trim() && !isValidEmail(professorEmail.trim()) && (
                    <p className={styles.inlineError}>The final professor email is not valid.</p>
                )}
            </PanelSection>

            <PanelSection
                title="Possible existing professors"
                subtitle={matches.length > 0 ? `${matches.length} candidates ranked by similarity.` : "No existing-professor candidates were returned."}
            >
                {matches.length > 0 ? (
                    <div className={styles.matchList}>
                        {matches.map(match => (
                            <MatchButton
                                key={match.email}
                                match={match}
                                selected={resolvedProfessorEmail.toLowerCase() === match.email.toLowerCase()}
                                onSelect={() => {
                                    setResolvedProfessorEmail(match.email);
                                    setError("");
                                }}
                            />
                        ))}
                    </div>
                ) : <p className={styles.emptyLine}>Search found no likely existing professor.</p>}
                <PanelField label="Resolved professor email" hint="Required only when marking a duplicate">
                    <Input
                        autoCapitalize="none"
                        inputMode="email"
                        placeholder="existing.professor@example.edu"
                        value={resolvedProfessorEmail}
                        onChange={event => setResolvedProfessorEmail(event.target.value)}
                    />
                </PanelField>
            </PanelSection>

            <PanelSection title="Request context">
                <dl className={styles.contextGrid}>
                    <ContextItem label="Request ID" value={request.id}/>
                    <ContextItem label="Submitted" value={formatDateTime(request.created_at)}/>
                    <ContextItem label="Session" value={<EntityLink target={{type: "session", id: request.session_id}}>Session {request.session_id}</EntityLink>}/>
                    <ContextItem label="User" value={request.user_id
                        ? <EntityLink target={{type: "user", id: request.user_id}}>User {request.user_id}</EntityLink>
                        : "Anonymous"}/>
                    {request.reviewed_at && <ContextItem label="Reviewed" value={formatDateTime(request.reviewed_at)}/>} 
                    {request.reviewer_user_id && <ContextItem label="Reviewer" value={`User ${request.reviewer_user_id}`}/>} 
                </dl>
            </PanelSection>

            {((request.signals || []).length > 0 || (request.action_history || []).length > 0) && (
                <PanelSection title="Signals and history">
                    {(request.signals || []).length > 0 && (
                        <div className={styles.activityList}>
                            {(request.signals || []).map((signal, index) => (
                                <article key={signal.id || `${signal.source}-${signal.attribute}-${index}`}>
                                    <ShieldAlert size={15}/>
                                    <div>
                                        <strong>{signal.attribute}</strong>
                                        <span>{signal.source} · {signal.severity || "signal"} · {formatDateTime(signal.created_at)}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    {(request.action_history || []).length > 0 && (
                        <div className={styles.activityList}>
                            {(request.action_history || []).map(action => (
                                <article key={action.id}>
                                    <History size={15}/>
                                    <div>
                                        <strong>{statusLabel(action.action)}</strong>
                                        <span>{action.reason_code || "No reason"} · {formatDateTime(action.created_at)}</span>
                                        {action.note && <p dir="auto">{action.note}</p>}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </PanelSection>
            )}

            <PanelSection title="Decision record" subtitle="Reason and note are stored with the moderation action.">
                <div className={styles.decisionFields}>
                    <label className={styles.field}>
                        <span>Reason <small>optional</small></span>
                        <select value={reason} onChange={event => setReason(event.target.value)}>
                            <option value="">No reason selected</option>
                            {reasons.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className={styles.field}>
                        <span>Internal note <small>optional</small></span>
                        <Textarea maxLength={4000} placeholder="Add context for the audit history" rows={3} value={note} onChange={event => setNote(event.target.value)}/>
                    </label>
                </div>
            </PanelSection>

            <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
                {error && <p className={styles.actionError} role="alert">{error}</p>}
                {message && <p className={styles.actionSuccess} role="status">{message}</p>}
                {!requestPending && !message && <p className={styles.actionSuccess}>This request already has a recorded decision.</p>}
            </div>

            <footer className={styles.panelActions}>
                <Button
                    disabled={!requestPending || Boolean(pendingDecision)}
                    type="button"
                    onClick={() => void submitDecision("approve")}
                >
                    {pendingDecision === "approve" ? <LoaderCircle className={styles.spin} size={16}/> : <CheckCircle2 size={16}/>}
                    Approve &amp; add
                </Button>
                <Button
                    disabled={!requestPending || Boolean(pendingDecision)}
                    type="button"
                    variant="outline"
                    onClick={() => void submitDecision("mark_duplicate")}
                >
                    {pendingDecision === "mark_duplicate" ? <LoaderCircle className={styles.spin} size={16}/> : <CopyCheck size={16}/>}
                    Mark duplicate
                </Button>
                <Button
                    disabled={!requestPending || Boolean(pendingDecision)}
                    type="button"
                    variant="outline"
                    onClick={() => void submitDecision("dismiss")}
                >
                    {pendingDecision === "dismiss" ? <LoaderCircle className={styles.spin} size={16}/> : <X size={16}/>}
                    Dismiss
                </Button>
                <Button
                    disabled={!requestPending || Boolean(pendingDecision)}
                    type="button"
                    variant="destructive"
                    onClick={() => void submitDecision("reject")}
                >
                    {pendingDecision === "reject" ? <LoaderCircle className={styles.spin} size={16}/> : <XCircle size={16}/>}
                    Reject
                </Button>
            </footer>
        </div>
    );
}

function MatchButton({match, selected, onSelect}: {match: AdminProfessorMatch; selected: boolean; onSelect: () => void}) {
    return (
        <button className={cn(styles.matchCard, selected && styles.matchSelected)} type="button" aria-pressed={selected} onClick={onSelect}>
            <span className={styles.matchIcon}>{selected ? <CheckCircle2 size={17}/> : <Link2 size={17}/>}</span>
            <span className={styles.matchBody}>
                <strong dir="auto">{match.name}</strong>
                <span dir="auto">{match.email}</span>
                <small dir="auto">{match.university} · {match.college}</small>
            </span>
            <span className={styles.matchScore}>
                <strong>{formatSimilarity(match.name_similarity)}</strong>
                <small>{humanize(match.match_type)}</small>
                <span className={cn(styles.matchVisibility, match.visible ? styles.matchVisible : styles.matchHidden)}>
                    {match.visible ? "Visible" : "Hidden"}
                </span>
            </span>
        </button>
    );
}

function PanelSection({title, subtitle, children}: {title: string; subtitle?: string; children: ReactNode}) {
    return (
        <section className={styles.panelSection}>
            <header>
                <h3>{title}</h3>
                {subtitle && <p>{subtitle}</p>}
            </header>
            {children}
        </section>
    );
}

function PanelField({label, hint, children}: {label: string; hint?: string; children: ReactNode}) {
    return (
        <label className={styles.field}>
            <span>{label}{hint && <small>{hint}</small>}</span>
            {children}
        </label>
    );
}

function ContextItem({label, value}: {label: string; value: ReactNode}) {
    return (
        <div>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function StateNotice({
    icon,
    title,
    message,
    action,
    danger = false,
}: {
    icon: ReactNode;
    title: string;
    message: string;
    action?: ReactNode;
    danger?: boolean;
}) {
    return (
        <div className={cn(styles.stateNotice, danger && styles.stateNoticeDanger)}>
            <span className={styles.stateIcon}>{icon}</span>
            <div>
                <strong>{title}</strong>
                <span>{message}</span>
            </div>
            {action}
        </div>
    );
}

function RequestSkeleton() {
    return (
        <div className={styles.skeletonList} aria-label="Loading professor requests">
            {Array.from({length: 5}).map((_, index) => (
                <div className={styles.skeletonCard} key={index}>
                    <span/><span/><span/><span/>
                </div>
            ))}
        </div>
    );
}

function completenessFor(request: Pick<AdminProfessorRequest, "professor_name" | "professor_email" | "university" | "college">) {
    const values = [
        {label: "name", value: request.professor_name},
        {label: "email", value: request.professor_email},
        {label: "university", value: request.university},
        {label: "college", value: request.college},
    ];
    const missing = values.filter(field => !field.value?.trim()).map(field => field.label);
    return {count: values.length - missing.length, missing};
}

function recommendationFor(request: AdminProfessorRequest): {
    kind: RecommendationKind;
    label: string;
    description: string;
    tone: "success" | "warning" | "danger";
    icon: ReactNode;
} {
    const likelyMatch = (request.matches || []).find(match => (
        normalizedSimilarity(match.name_similarity) >= 0.85
        || match.match_type === "exact_email"
        || match.match_type === "same_university_name"
    ));
    if (request.likely_duplicate || likelyMatch) {
        return {
            kind: "duplicate",
            label: "Likely duplicate",
            description: likelyMatch
                ? `${likelyMatch.name} is a strong existing-professor match. Review the candidate before deciding.`
                : "A strong existing-professor match was found. Review the candidates before deciding.",
            tone: "danger",
            icon: <CopyCheck size={17}/>,
        };
    }

    const completeness = completenessFor(request);
    if (completeness.missing.length > 0 || (request.professor_email && !isValidEmail(request.professor_email))) {
        return {
            kind: "details",
            label: "Needs details",
            description: completeness.missing.length > 0
                ? `Complete ${completeness.missing.join(", ")} before approval.`
                : "Correct the professor email before approval.",
            tone: "warning",
            icon: <AlertCircle size={17}/>,
        };
    }

    return {
        kind: "ready",
        label: "Ready to add",
        description: "All required fields are present and no strong duplicate candidate was found.",
        tone: "success",
        icon: <CheckCircle2 size={17}/>,
    };
}

function normalizeRequest(request: AdminProfessorRequest): AdminProfessorRequest {
    return {
        ...request,
        related_group_id: request.related_group_id || request.id,
        related_request_count: request.related_request_count || 0,
        likely_duplicate: Boolean(request.likely_duplicate),
        matches: request.matches || [],
        signals: request.signals || [],
        action_history: request.action_history || [],
    };
}

function groupProfessorRequests(requests: AdminProfessorRequest[]): ProfessorRequestGroup[] {
    const groups = new Map<string, ProfessorRequestGroup>();
    for (const request of requests) {
        const groupID = request.related_group_id || request.id;
        const existing = groups.get(groupID);
        const knownTotal = Math.max(1, request.related_request_count + 1);
        if (existing) {
            existing.requests.push(request);
            existing.total = Math.max(existing.total, knownTotal, existing.requests.length);
            continue;
        }
        groups.set(groupID, {
            id: groupID,
            requests: [request],
            total: knownTotal,
        });
    }
    return [...groups.values()];
}

function duplicateFilterLabel(filter: AdminProfessorRequestDuplicateFilter) {
    if (filter === "likely") return "Likely duplicate";
    if (filter === "not_likely") return "Not likely duplicate";
    return "All duplicate likelihoods";
}

function emptyQueueTitle(search: string, status: AdminProfessorRequestStatusFilter, duplicate: AdminProfessorRequestDuplicateFilter) {
    if (search) return "No matching requests";
    if (duplicate === "likely") return "No likely duplicate requests";
    if (duplicate === "not_likely") return "No requests without a likely duplicate";
    return `No ${statusLabel(status).toLowerCase()} requests`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "outline" {
    switch (status) {
    case "approved": return "success";
    case "pending": return "warning";
    case "rejected": return "danger";
    case "dismissed": return "outline";
    default: return "info";
    }
}

function statusLabel(status: string) {
    const label = humanize(status);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function humanize(value: string) {
    return value.replace(/_/g, " ").trim();
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizedSimilarity(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function formatSimilarity(value: number) {
    return `${Math.round(normalizedSimilarity(value) * 100)}%`;
}

function formatDateTime(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function decisionSuccessMessage(decision: AdminProfessorRequestDecision, action: string) {
    if (decision === "approve") return "Professor added and request approved.";
    if (decision === "mark_duplicate") return "Request linked to the existing professor and marked as a duplicate.";
    if (decision === "reject") return "Request rejected.";
    if (decision === "dismiss") return "Request dismissed.";
    return `${statusLabel(action)} saved.`;
}
