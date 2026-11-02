import {type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {ExternalLink, GitMerge, LoaderCircle, Plus, RefreshCw, Save, Search, X} from "lucide-react";
import {useAdminEntityDrawer} from "@/components/admin/entity_drawer";
import {useLockedBodyScroll} from "@/components/admin/suspicious_queue";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
    AdminApiError,
    type AdminCatalogProfessor,
    type AdminCatalogProfessorDetail,
    type AdminCatalogProfessorListResponse,
    type AdminCatalogProfessorQuery,
    getAdminCatalogProfessor,
    listAdminCatalogProfessors,
    mergeAdminCatalogProfessor,
    updateAdminCatalogProfessor,
} from "@/lib/admin_api";
import {publicSiteUrl} from "@/lib/public_site";
import {useUrlFilters, useUrlParam} from "@/lib/url_state";
import {cn} from "@/lib/utils";
import styles from "./catalog.module.scss";

const pageSize = 50;
const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"});

const defaultQuery = {search: "", visible: "any", university: "", sort: "reviews", offset: "0"};

const sortOptions = [
    {value: "reviews", label: "Most reviews"},
    {value: "fewest_reviews", label: "Fewest reviews"},
    {value: "views", label: "Most views"},
    {value: "name", label: "Name A–Z"},
];

export function ProfessorsPage() {
    const [query, setQuery] = useUrlFilters(defaultQuery);
    const [selectedEmail, setSelectedEmail] = useUrlParam("professor");
    const [searchDraft, setSearchDraft] = useState(query.search);
    const [data, setData] = useState<AdminCatalogProfessorListResponse | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => setSearchDraft(query.search), [query.search]);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState("loading");
        listAdminCatalogProfessors(controller.signal, {...query, offset: Number(query.offset) || 0} as AdminCatalogProfessorQuery)
            .then(response => {
                setData(response);
                setLoadState("ready");
            })
            .catch(() => {
                if (!controller.signal.aborted) setLoadState("error");
            });
        return () => controller.abort();
    }, [query, reloadKey]);

    function update(patch: Partial<typeof defaultQuery>) {
        setQuery({...query, offset: "0", ...patch});
    }

    function submitSearch(event: FormEvent) {
        event.preventDefault();
        update({search: searchDraft.trim()});
    }

    const offset = Number(query.offset) || 0;
    const total = data?.total ?? 0;

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Catalog</p>
                    <h1 className={styles.title}>Professors</h1>
                    <p className={styles.description}>
                        Edit details, hide professors, or merge duplicates. The public site shows changes after its cache refreshes (up to 12 hours).
                    </p>
                </div>
                <Button type="button" variant="outline" disabled={loadState === "loading"} onClick={() => setReloadKey(key => key + 1)}>
                    <RefreshCw size={16}/>
                    Refresh
                </Button>
            </section>

            <div className={styles.toolbar}>
                <form className={styles.searchForm} onSubmit={submitSearch}>
                    <Input
                        aria-label="Search professors"
                        placeholder="Name, email, alias, college or university"
                        value={searchDraft}
                        onChange={event => setSearchDraft(event.target.value)}
                    />
                    <Button type="submit"><Search size={16}/>Search</Button>
                </form>
                <label className={styles.field}>
                    <span>University</span>
                    <select className={styles.select} value={query.university} onChange={event => update({university: event.target.value})}>
                        <option value="">All universities</option>
                        {(data?.universities ?? []).map(university => <option key={university} value={university}>{university}</option>)}
                    </select>
                </label>
                <label className={styles.field}>
                    <span>Status</span>
                    <select className={styles.select} value={query.visible} onChange={event => update({visible: event.target.value})}>
                        <option value="any">All</option>
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                    </select>
                </label>
                <label className={styles.field}>
                    <span>Sort</span>
                    <select className={styles.select} value={query.sort} onChange={event => update({sort: event.target.value})}>
                        {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </label>
            </div>

            {loadState === "error" && !data && (
                <div className={styles.notice}>
                    <strong>Professors could not be loaded</strong>
                    <Button type="button" variant="outline" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>
                </div>
            )}
            {loadState === "loading" && !data && (
                <div className={styles.notice}><LoaderCircle className={styles.spin} size={18}/><strong>Loading professors</strong></div>
            )}

            {data && (
                <>
                    <div className={styles.tableWrap} style={{opacity: loadState === "loading" ? 0.55 : 1}}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Professor</th>
                                    <th className={styles.hideSmall}>University</th>
                                    <th className={styles.numeric}>Reviews</th>
                                    <th className={cn(styles.numeric, styles.hideSmall)}>Views</th>
                                    <th className={cn(styles.numeric, styles.hideSmall)}>Courses</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.professors.length === 0 && (
                                    <tr><td colSpan={6} className={styles.muted}>No professors match these filters.</td></tr>
                                )}
                                {data.professors.map(professor => (
                                    <ProfessorRow
                                        key={professor.email}
                                        professor={professor}
                                        selected={professor.email === selectedEmail}
                                        onOpen={() => setSelectedEmail(professor.email, {push: true})}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className={styles.pagination}>
                        <span>
                            {total === 0 ? "0 professors" : `${offset + 1}–${Math.min(offset + pageSize, total)} of ${numberFormat.format(total)}`}
                        </span>
                        <div className={styles.paginationButtons}>
                            <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setQuery({...query, offset: String(Math.max(0, offset - pageSize))})}>
                                Previous
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={offset + pageSize >= total} onClick={() => setQuery({...query, offset: String(offset + pageSize)})}>
                                Next
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {selectedEmail && (
                <ProfessorPanel
                    email={selectedEmail}
                    universities={data?.universities ?? []}
                    onClose={() => setSelectedEmail("")}
                    onChanged={() => setReloadKey(key => key + 1)}
                    onMerged={targetEmail => {
                        setSelectedEmail(targetEmail);
                        setReloadKey(key => key + 1);
                    }}
                />
            )}
        </div>
    );
}

function ProfessorRow({professor, selected, onOpen}: { professor: AdminCatalogProfessor; selected: boolean; onOpen: () => void }) {
    function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
        }
    }

    return (
        <tr className={cn(styles.rowButton, selected && styles.rowSelected)} tabIndex={0} onClick={onOpen} onKeyDown={onKeyDown}>
            <td>
                <div className={styles.primaryCell}>
                    <strong dir="auto">{professor.name}</strong>
                    <span>{professor.email}{professor.aliases.length > 0 ? ` · ${professor.aliases.length} aliases` : ""}</span>
                </div>
            </td>
            <td className={styles.hideSmall}>
                <div className={styles.primaryCell}>
                    <strong dir="auto">{professor.university}</strong>
                    <span dir="auto">{professor.college}</span>
                </div>
            </td>
            <td className={styles.numeric}>
                {numberFormat.format(professor.visible_review_count)}
                {professor.review_count !== professor.visible_review_count && <span className={styles.muted}> / {numberFormat.format(professor.review_count)}</span>}
            </td>
            <td className={cn(styles.numeric, styles.hideSmall)}>{numberFormat.format(professor.views)}</td>
            <td className={cn(styles.numeric, styles.hideSmall)}>{professor.course_count}</td>
            <td><Badge variant={professor.visible ? "success" : "danger"}>{professor.visible ? "Visible" : "Hidden"}</Badge></td>
        </tr>
    );
}

type Draft = {
    name: string;
    college: string;
    university: string;
    aliases: string;
    visible: boolean;
    courseTags: string[];
    reasonCode: string;
    note: string;
};

function draftFrom(professor: AdminCatalogProfessorDetail): Draft {
    return {
        name: professor.name,
        college: professor.college,
        university: professor.university,
        aliases: professor.aliases.join("\n"),
        visible: professor.visible,
        courseTags: professor.courses.map(course => course.tag),
        reasonCode: "",
        note: "",
    };
}

function ProfessorPanel({email, universities, onClose, onChanged, onMerged}: {
    email: string;
    universities: string[];
    onClose: () => void;
    onChanged: () => void;
    onMerged: (targetEmail: string) => void;
}) {
    const {reasons} = useAdminEntityDrawer();
    const [professor, setProfessor] = useState<AdminCatalogProfessorDetail | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loadError, setLoadError] = useState("");
    const [courseInput, setCourseInput] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    useLockedBodyScroll(true);

    const load = useCallback((signal?: AbortSignal) => {
        setLoadError("");
        getAdminCatalogProfessor(email, signal)
            .then(response => {
                setProfessor(response.professor);
                setDraft(draftFrom(response.professor));
            })
            .catch((err: unknown) => {
                if (signal?.aborted) return;
                setLoadError(err instanceof AdminApiError && err.status === 404 ? "This professor no longer exists." : "Could not load this professor.");
            });
    }, [email]);

    useEffect(() => {
        setProfessor(null);
        setDraft(null);
        setMessage("");
        setError("");
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    useEffect(() => {
        function onKey(event: globalThis.KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const activeReasons = useMemo(() => reasons.filter(reason => reason.active), [reasons]);
    const visibilityChanged = Boolean(professor && draft && professor.visible !== draft.visible);

    function patch(next: Partial<Draft>) {
        setDraft(current => (current ? {...current, ...next} : current));
        setMessage("");
        setError("");
    }

    function addCourse() {
        const tag = courseInput.trim().toUpperCase();
        if (!tag || !draft) return;
        if (!draft.courseTags.includes(tag)) patch({courseTags: [...draft.courseTags, tag].sort()});
        setCourseInput("");
    }

    async function save(event: FormEvent) {
        event.preventDefault();
        if (!draft) return;
        if (visibilityChanged && !draft.visible && !draft.reasonCode) {
            setError("Choose a reason for hiding this professor.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const response = await updateAdminCatalogProfessor(email, {
                name: draft.name,
                college: draft.college,
                university: draft.university,
                aliases: draft.aliases.split("\n").map(alias => alias.trim()).filter(Boolean),
                visible: draft.visible,
                course_tags: draft.courseTags,
                reason_code: visibilityChanged ? draft.reasonCode || undefined : undefined,
                note: draft.note.trim() || undefined,
            });
            setProfessor(response.professor);
            setDraft(draftFrom(response.professor));
            setMessage("Saved.");
            onChanged();
        } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Could not save changes.");
        } finally {
            setSaving(false);
        }
    }

    return createPortal((
        <div className={styles.panelLayer}>
            <button aria-label="Close professor" className={styles.panelBackdrop} type="button" onClick={onClose}/>
            <aside aria-label="Professor details" aria-modal="true" className={styles.panel} role="dialog">
                <header className={styles.panelHeader}>
                    <div>
                        <h2 dir="auto">{professor?.name || "Professor"}</h2>
                        <p>{email}</p>
                    </div>
                    <div className={styles.actions}>
                        <Button asChild size="sm" variant="outline">
                            <a href={publicSiteUrl(`/professor/${encodeURIComponent(email)}`)} target="_blank" rel="noreferrer">
                                <ExternalLink size={14}/>
                                Site
                            </a>
                        </Button>
                        <Button aria-label="Close" size="icon" type="button" variant="ghost" onClick={onClose}><X size={16}/></Button>
                    </div>
                </header>

                <div className={styles.panelBody}>
                    {loadError && <p className={styles.error}>{loadError}</p>}
                    {!professor && !loadError && <p className={styles.hint}><LoaderCircle className={styles.spin} size={14}/> Loading…</p>}

                    {professor && draft && (
                        <>
                            <div className={styles.statRow}>
                                <div className={styles.stat}>
                                    <strong>{numberFormat.format(professor.visible_review_count)}</strong>
                                    <span>visible reviews of {numberFormat.format(professor.review_count)}</span>
                                </div>
                                <div className={styles.stat}>
                                    <strong>{numberFormat.format(professor.views)}</strong>
                                    <span>page views</span>
                                </div>
                                <div className={styles.stat}>
                                    <strong>{numberFormat.format(professor.views_last_30_days)}</strong>
                                    <span>views, last 30 days</span>
                                </div>
                            </div>

                            <form className={styles.panelSection} onSubmit={save}>
                                <h3>Details</h3>
                                <div className={styles.formGrid}>
                                    <label className={cn(styles.field, styles.full)}>
                                        <span>Name</span>
                                        <Input dir="auto" required value={draft.name} onChange={event => patch({name: event.target.value})}/>
                                    </label>
                                    <label className={styles.field}>
                                        <span>University</span>
                                        <Input list="catalog-universities" required value={draft.university} onChange={event => patch({university: event.target.value})}/>
                                        <datalist id="catalog-universities">
                                            {universities.map(university => <option key={university} value={university}/>)}
                                        </datalist>
                                    </label>
                                    <label className={styles.field}>
                                        <span>College</span>
                                        <Input dir="auto" required value={draft.college} onChange={event => patch({college: event.target.value})}/>
                                    </label>
                                    <label className={cn(styles.field, styles.full)}>
                                        <span>Aliases · one per line, used in search</span>
                                        <Textarea dir="auto" rows={3} value={draft.aliases} onChange={event => patch({aliases: event.target.value})}/>
                                    </label>
                                </div>

                                <div className={styles.field}>
                                    <span>Courses taught</span>
                                    <div className={styles.chips}>
                                        {draft.courseTags.length === 0 && <span className={styles.hint}>No courses linked.</span>}
                                        {draft.courseTags.map(tag => (
                                            <span className={styles.chip} key={tag}>
                                                {tag}
                                                <button
                                                    aria-label={`Remove ${tag}`}
                                                    type="button"
                                                    onClick={() => patch({courseTags: draft.courseTags.filter(item => item !== tag)})}
                                                >
                                                    <X size={12}/>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className={styles.inlineAdd}>
                                        <Input
                                            aria-label="Course tag to add"
                                            placeholder="Course tag, e.g. CSBP219"
                                            value={courseInput}
                                            onChange={event => setCourseInput(event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    addCourse();
                                                }
                                            }}
                                        />
                                        <Button type="button" variant="outline" onClick={addCourse}><Plus size={15}/>Add</Button>
                                    </div>
                                </div>

                                <label className={styles.toggle}>
                                    <input type="checkbox" checked={draft.visible} onChange={event => patch({visible: event.target.checked})}/>
                                    Visible on the site
                                </label>
                                {visibilityChanged && !draft.visible && (
                                    <label className={styles.field}>
                                        <span>Reason for hiding</span>
                                        <select className={styles.select} value={draft.reasonCode} onChange={event => patch({reasonCode: event.target.value})}>
                                            <option value="">Choose a reason</option>
                                            {activeReasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                                        </select>
                                    </label>
                                )}
                                <label className={styles.field}>
                                    <span>Internal note · optional</span>
                                    <Input value={draft.note} onChange={event => patch({note: event.target.value})}/>
                                </label>

                                <div className={styles.actions}>
                                    <Button type="submit" disabled={saving}>
                                        {saving ? <LoaderCircle className={styles.spin} size={16}/> : <Save size={16}/>}
                                        Save changes
                                    </Button>
                                    <Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(draftFrom(professor))}>Discard</Button>
                                    {message && <p className={styles.status}>{message}</p>}
                                    {error && <p className={styles.error}>{error}</p>}
                                </div>
                            </form>

                            <MergeSection professor={professor} onMerged={onMerged}/>

                            <section className={styles.panelSection}>
                                <h3>History</h3>
                                {professor.action_history.length === 0 ? (
                                    <p className={styles.hint}>No admin changes recorded.</p>
                                ) : (
                                    <ul className={styles.history}>
                                        {professor.action_history.map(action => (
                                            <li key={action.id}>
                                                <strong>{actionLabel(action.action)}</strong>
                                                <span>
                                                    {dateFormat.format(new Date(action.created_at))}
                                                    {action.actor_user_id ? ` · User ${action.actor_user_id}` : ""}
                                                    {action.note ? ` · ${action.note}` : ""}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </aside>
        </div>
    ), document.body);
}

function MergeSection({professor, onMerged}: { professor: AdminCatalogProfessorDetail; onMerged: (targetEmail: string) => void }) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<AdminCatalogProfessor[]>([]);
    const [target, setTarget] = useState<AdminCatalogProfessor | null>(null);
    const [note, setNote] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const term = search.trim();
        if (term.length < 2) {
            setResults([]);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            listAdminCatalogProfessors(controller.signal, {search: term, sort: "reviews"})
                .then(response => setResults(response.professors.filter(item => item.email !== professor.email).slice(0, 6)))
                .catch(() => undefined);
        }, 250);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [search, professor.email]);

    async function merge() {
        if (!target) return;
        setPending(true);
        setError("");
        try {
            await mergeAdminCatalogProfessor(professor.email, {target_email: target.email, note: note.trim() || undefined});
            onMerged(target.email);
        } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Could not merge professors.");
            setPending(false);
        }
    }

    return (
        <section className={cn(styles.panelSection, styles.dangerZone)}>
            <h3>Merge into another professor</h3>
            <p className={styles.hint}>
                Use this for duplicates. All {professor.review_count} reviews, linked courses and view history move to the professor you pick,
                this professor’s name is kept as an alias, and this record is deleted. This cannot be undone.
            </p>
            <Input
                aria-label="Find the professor to keep"
                placeholder="Find the professor to keep"
                value={search}
                onChange={event => {
                    setSearch(event.target.value);
                    setConfirming(false);
                }}
            />
            {results.length > 0 && (
                <div className={styles.matchList}>
                    {results.map(result => (
                        <button
                            key={result.email}
                            type="button"
                            className={cn(styles.matchOption, target?.email === result.email && styles.matchSelected)}
                            onClick={() => {
                                setTarget(result);
                                setConfirming(false);
                            }}
                        >
                            <span className={styles.primaryCell}>
                                <strong dir="auto">{result.name}</strong>
                                <span>{result.email} · {result.university}</span>
                            </span>
                            <Badge variant="outline">{result.review_count} reviews</Badge>
                        </button>
                    ))}
                </div>
            )}
            {target && (
                <>
                    <label className={styles.field}>
                        <span>Internal note · optional</span>
                        <Input value={note} onChange={event => setNote(event.target.value)}/>
                    </label>
                    {confirming ? (
                        <div className={styles.actions}>
                            <Button type="button" variant="destructive" disabled={pending} onClick={() => void merge()}>
                                {pending ? <LoaderCircle className={styles.spin} size={16}/> : <GitMerge size={16}/>}
                                Confirm: move {professor.review_count} reviews and delete
                            </Button>
                            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
                        </div>
                    ) : (
                        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                            <GitMerge size={16}/>
                            Merge into {target.name}
                        </Button>
                    )}
                </>
            )}
            {error && <p className={styles.error}>{error}</p>}
        </section>
    );
}

function actionLabel(action: string) {
    const labels: Record<string, string> = {
        edit: "Details edited",
        hide: "Hidden",
        restore: "Made visible",
        merge: "Merged",
        approve: "Approved",
        reject: "Rejected",
        note: "Note added",
    };
    return labels[action] || action;
}
