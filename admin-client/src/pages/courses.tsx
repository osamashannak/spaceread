import {type FormEvent, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {ExternalLink, LoaderCircle, Pencil, RefreshCw, Save, Search, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    AdminApiError,
    type AdminCatalogCourse,
    type AdminCatalogCourseListResponse,
    listAdminCatalogCourses,
    updateAdminCatalogCourse,
} from "@/lib/admin_api";
import {publicSiteUrl} from "@/lib/public_site";
import {useUrlFilters} from "@/lib/url_state";
import {cn} from "@/lib/utils";
import styles from "./catalog.module.scss";

const pageSize = 50;
const numberFormat = new Intl.NumberFormat("en-US");
const defaultQuery = {search: "", sort: "views", offset: "0"};

export function CoursesPage() {
    const [query, setQuery] = useUrlFilters(defaultQuery);
    const [searchDraft, setSearchDraft] = useState(query.search);
    const [data, setData] = useState<AdminCatalogCourseListResponse | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => setSearchDraft(query.search), [query.search]);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState("loading");
        listAdminCatalogCourses(controller.signal, {
            search: query.search,
            sort: query.sort as "views" | "files" | "tag",
            offset: Number(query.offset) || 0,
        })
            .then(response => {
                setData(response);
                setLoadState("ready");
            })
            .catch(() => {
                if (!controller.signal.aborted) setLoadState("error");
            });
        return () => controller.abort();
    }, [query, reloadKey]);

    function replaceCourse(course: AdminCatalogCourse) {
        setData(current => current && {...current, courses: current.courses.map(item => (item.tag === course.tag ? course : item))});
    }

    const offset = Number(query.offset) || 0;
    const total = data?.total ?? 0;

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Catalog</p>
                    <h1 className={styles.title}>Courses</h1>
                    <p className={styles.description}>Rename courses and jump to their files. Course codes can’t be changed here.</p>
                </div>
                <Button type="button" variant="outline" disabled={loadState === "loading"} onClick={() => setReloadKey(key => key + 1)}>
                    <RefreshCw size={16}/>
                    Refresh
                </Button>
            </section>

            <div className={styles.toolbar}>
                <form
                    className={styles.searchForm}
                    onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                        setQuery({...query, search: searchDraft.trim(), offset: "0"});
                    }}
                >
                    <Input aria-label="Search courses" placeholder="Course code or name" value={searchDraft} onChange={event => setSearchDraft(event.target.value)}/>
                    <Button type="submit"><Search size={16}/>Search</Button>
                </form>
                <label className={styles.field}>
                    <span>Sort</span>
                    <select className={styles.select} value={query.sort} onChange={event => setQuery({...query, sort: event.target.value, offset: "0"})}>
                        <option value="views">Most views</option>
                        <option value="files">Most files</option>
                        <option value="tag">Course code</option>
                    </select>
                </label>
            </div>

            {loadState === "error" && !data && (
                <div className={styles.notice}>
                    <strong>Courses could not be loaded</strong>
                    <Button type="button" variant="outline" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>
                </div>
            )}
            {loadState === "loading" && !data && (
                <div className={styles.notice}><LoaderCircle className={styles.spin} size={18}/><strong>Loading courses</strong></div>
            )}

            {data && (
                <>
                    <div className={styles.tableWrap} style={{opacity: loadState === "loading" ? 0.55 : 1}}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th className={styles.numeric}>Views</th>
                                    <th className={styles.numeric}>Files</th>
                                    <th className={cn(styles.numeric, styles.hideSmall)}>Professors</th>
                                    <th/>
                                </tr>
                            </thead>
                            <tbody>
                                {data.courses.length === 0 && <tr><td colSpan={5} className={styles.muted}>No courses match.</td></tr>}
                                {data.courses.map(course => <CourseRow key={course.tag} course={course} onSaved={replaceCourse}/>)}
                            </tbody>
                        </table>
                    </div>
                    <div className={styles.pagination}>
                        <span>{total === 0 ? "0 courses" : `${offset + 1}–${Math.min(offset + pageSize, total)} of ${numberFormat.format(total)}`}</span>
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
        </div>
    );
}

function CourseRow({course, onSaved}: { course: AdminCatalogCourse; onSaved: (course: AdminCatalogCourse) => void }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(course.name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function save(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const response = await updateAdminCatalogCourse(course.tag, {name});
            onSaved(response.course);
            setEditing(false);
        } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Could not rename the course.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <tr>
            <td>
                {editing ? (
                    <form className={styles.inlineEdit} onSubmit={save}>
                        <Input aria-label={`New name for ${course.tag}`} autoFocus dir="auto" required value={name} onChange={event => setName(event.target.value)}/>
                        <Button type="submit" size="sm" disabled={saving}>
                            {saving ? <LoaderCircle className={styles.spin} size={14}/> : <Save size={14}/>}
                            Save
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => {
                                setEditing(false);
                                setName(course.name);
                                setError("");
                            }}
                        >
                            <X size={14}/>
                        </Button>
                        {error && <p className={styles.error}>{error}</p>}
                    </form>
                ) : (
                    <div className={styles.primaryCell}>
                        <strong>{course.tag}</strong>
                        <span dir="auto">{course.name}</span>
                    </div>
                )}
            </td>
            <td className={styles.numeric}>{numberFormat.format(course.views)}</td>
            <td className={styles.numeric}>
                <Link to={`/course-files?course_tag=${encodeURIComponent(course.tag)}&needs_attention=false`}>
                    {numberFormat.format(course.visible_file_count)}
                    {course.file_count !== course.visible_file_count && <span className={styles.muted}> / {numberFormat.format(course.file_count)}</span>}
                </Link>
            </td>
            <td className={cn(styles.numeric, styles.hideSmall)}>{course.professor_count}</td>
            <td className={styles.numeric}>
                <div className={styles.actions} style={{justifyContent: "flex-end"}}>
                    {!editing && (
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                            <Pencil size={14}/>
                            Rename
                        </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                        <a href={publicSiteUrl(`/course/${encodeURIComponent(course.tag)}`)} target="_blank" rel="noreferrer" aria-label={`Open ${course.tag} on the site`}>
                            <ExternalLink size={14}/>
                        </a>
                    </Button>
                </div>
            </td>
        </tr>
    );
}
