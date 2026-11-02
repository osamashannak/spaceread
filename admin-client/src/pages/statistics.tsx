import {type ReactNode, useEffect, useMemo, useState} from "react";
import {ArrowDownRight, ArrowUpRight, LoaderCircle, Minus, RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {LineChart, type LineSeries} from "@/components/admin/line_chart";
import {cn} from "@/lib/utils";
import {
    type AdminStatsBucket,
    type AdminStatsCounts,
    type AdminStatsPoint,
    type AdminStatsRangeKey,
    type AdminStatsResponse,
    getAdminStats,
} from "@/lib/admin_api";
import {useUrlFilters} from "@/lib/url_state";
import styles from "./statistics.module.scss";

const rangeOptions: { key: AdminStatsRangeKey; label: string; previous: string }[] = [
    {key: "7d", label: "7 days", previous: "previous 7 days"},
    {key: "30d", label: "30 days", previous: "previous 30 days"},
    {key: "90d", label: "90 days", previous: "previous 90 days"},
    {key: "12m", label: "12 months", previous: "previous 12 months"},
    {key: "all", label: "All time", previous: ""},
];

const bucketOptions: { key: AdminStatsBucket; label: string }[] = [
    {key: "day", label: "Daily"},
    {key: "week", label: "Weekly"},
    {key: "month", label: "Monthly"},
];

const series = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const actionLabels: Record<string, string> = {
    approve: "Approved",
    reject: "Rejected",
    hide: "Hidden",
    restore: "Restored",
    dismiss: "Dismissed",
    resolve: "Resolved",
    mark_duplicate: "Marked duplicate",
    delete: "Deleted",
    note: "Note added",
};

const numberFormat = new Intl.NumberFormat("en-US");
const formatNumber = (value: number) => numberFormat.format(Math.round(value));
const formatPercent = (value: number) => `${value.toFixed(value >= 10 || value === 0 ? 0 : 1)}%`;

const defaultView = {range: "30d", bucket: ""};

export function StatisticsPage() {
    const [view, setView] = useUrlFilters(defaultView);
    const range = view.range as AdminStatsRangeKey;
    const bucket = (view.bucket || undefined) as AdminStatsBucket | undefined;
    const [data, setData] = useState<AdminStatsResponse | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState("loading");
        getAdminStats(controller.signal, {range, bucket})
            .then(response => {
                setData(response);
                setLoadState("ready");
            })
            .catch(() => {
                if (!controller.signal.aborted) setLoadState("error");
            });
        return () => controller.abort();
    }, [range, bucket, reloadKey]);

    const activeBucket = data?.range.bucket ?? bucket ?? "day";
    const rangeOption = rangeOptions.find(option => option.key === range) ?? rangeOptions[1];

    const axis = useMemo(() => {
        const points = data?.series ?? [];
        return {
            labels: points.map(point => axisLabel(point.start, activeBucket)),
            tooltips: points.map(point => periodLabel(point.start, activeBucket)),
        };
    }, [data, activeBucket]);

    function pick(label: string, color: string, value: (point: AdminStatsPoint) => number | null): LineSeries {
        return {key: label, label, color, values: (data?.series ?? []).map(value)};
    }

    function ratio(numerator: keyof AdminStatsCounts, denominator: keyof AdminStatsCounts) {
        return (point: AdminStatsPoint) => (point[denominator] > 0 ? (point[numerator] / point[denominator]) * 100 : null);
    }

    const current = data?.current;
    const previous = data?.previous;

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Insights</p>
                    <h1 className={styles.title}>Statistics</h1>
                    <p className={styles.description}>
                        Activity and moderation over time, in UAE time (GMT+4).
                    </p>
                </div>
                <Button
                    disabled={loadState === "loading"}
                    type="button"
                    variant="outline"
                    onClick={() => setReloadKey(key => key + 1)}
                >
                    <RefreshCw size={16}/>
                    Refresh
                </Button>
            </section>

            <div className={styles.filters}>
                <Segmented
                    label="Time range"
                    value={range}
                    options={rangeOptions}
                    onChange={key => setView({range: key, bucket: ""})}
                />
                <Segmented
                    label="Group by"
                    value={activeBucket}
                    options={bucketOptions}
                    onChange={key => setView({...view, bucket: key})}
                />
                {loadState === "loading" && data && <LoaderCircle className={styles.spin} size={16} aria-label="Updating"/>}
            </div>

            {loadState === "loading" && !data && (
                <div className={styles.stateNotice}>
                    <LoaderCircle className={styles.spin} size={18}/>
                    <strong>Loading statistics</strong>
                </div>
            )}

            {loadState === "error" && (
                <div className={styles.stateNotice}>
                    <strong>Statistics could not be loaded</strong>
                    <Button type="button" variant="outline" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>
                </div>
            )}

            {data && current && (
                <div className={cn(styles.content, loadState === "loading" && styles.refetching)}>
                    <section className={styles.kpis} aria-label="Selected period summary">
                        <Kpi label="Reviews written" value={current.reviews} previous={previous?.reviews} compare={rangeOption.previous}/>
                        <Kpi label="Active contributors" value={current.active_contributors} previous={previous?.active_contributors} compare={rangeOption.previous}/>
                        <Kpi label="Review votes" value={current.ratings} previous={previous?.ratings} compare={rangeOption.previous}/>
                        <Kpi label="Replies" value={current.replies} previous={previous?.replies} compare={rangeOption.previous}/>
                        <Kpi label="Course files uploaded" value={current.course_files} previous={previous?.course_files} compare={rangeOption.previous}/>
                        <Kpi label="Professor requests" value={current.professor_requests} previous={previous?.professor_requests} compare={rangeOption.previous}/>
                        <Kpi label="Reports received" value={current.reports} previous={previous?.reports} compare={rangeOption.previous}/>
                        <Kpi label="New accounts" value={current.signups} previous={previous?.signups} compare={rangeOption.previous}/>
                    </section>

                    <SectionHeading title="Activity"/>
                    <div className={styles.chartGrid}>
                        <LineChart
                            className={styles.wide}
                            title="New contributions"
                            description="Everything students submitted, per period."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[
                                pick("Reviews", series[0], p => p.reviews),
                                pick("Replies", series[1], p => p.replies),
                                pick("Course files", series[2], p => p.course_files),
                                pick("Professor requests", series[3], p => p.professor_requests),
                            ]}
                        />
                        <LineChart
                            title="Active contributors"
                            description="Distinct browsers that wrote a review, vote, reply, file or request."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[pick("Contributors", series[0], p => p.active_contributors)]}
                        />
                        <LineChart
                            title="Review votes"
                            description="Helpful and not helpful votes on reviews."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[
                                pick("Helpful", series[0], p => p.helpful_ratings),
                                pick("Not helpful", series[1], p => p.ratings - p.helpful_ratings),
                            ]}
                        />
                    </div>

                    <SectionHeading title="Review quality"/>
                    <div className={styles.kpis}>
                        <Stat label="Average score" value={current.reviews ? (current.review_score_sum / current.reviews).toFixed(2) : "—"} hint="out of 5"/>
                        <Stat label="Recommended" value={current.reviews ? formatPercent((current.positive_reviews / current.reviews) * 100) : "—"} hint="of reviews in range"/>
                        <Stat label="Student verified" value={current.reviews ? formatPercent((current.verified_reviews / current.reviews) * 100) : "—"} hint="of reviews in range"/>
                        <Stat label="Deleted by author" value={formatNumber(current.deleted_reviews)} hint="of reviews in range"/>
                    </div>
                    <div className={styles.chartGrid}>
                        <LineChart
                            className={styles.wide}
                            title="Review mix"
                            description="Share of each period's reviews. Hidden means currently hidden by moderation."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            maxValue={100}
                            formatAxis={value => `${value}%`}
                            formatValue={formatPercent}
                            series={[
                                pick("Recommended", series[0], ratio("positive_reviews", "reviews")),
                                pick("Student verified", series[1], ratio("verified_reviews", "reviews")),
                                pick("Hidden by moderation", series[2], ratio("hidden_reviews", "reviews")),
                            ]}
                        />
                    </div>

                    <SectionHeading title="Moderation"/>
                    <div className={styles.chartGrid}>
                        <LineChart
                            className={styles.wide}
                            title="Moderation workload"
                            description="Reports coming in against reports resolved, plus all moderator decisions."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[
                                pick("Reports received", series[0], p => p.reports),
                                pick("Reports resolved", series[1], p => p.reports_resolved),
                                pick("Moderator actions", series[2], p => p.moderation_actions),
                            ]}
                        />
                    </div>
                    <div className={styles.panelGrid}>
                        <Panel title="Queue right now" description="Items waiting for a moderator.">
                            <dl className={styles.facts}>
                                <Fact label="Unreviewed reviews" value={formatNumber(data.backlog.unreviewed_reviews)} hint={`${formatNumber(data.backlog.unreviewed_recent_reviews)} from the last 30 days`}/>
                                <Fact label="Unreviewed replies" value={formatNumber(data.backlog.unreviewed_replies)}/>
                                <Fact label="Unreviewed course files" value={formatNumber(data.backlog.unreviewed_course_files)}/>
                                <Fact label="Open reports" value={formatNumber(data.backlog.open_reports)}/>
                                <Fact label="Pending professor requests" value={formatNumber(data.backlog.pending_professor_requests)}/>
                            </dl>
                        </Panel>
                        <Panel title="Time to decision" description="Median time from submission to a moderator decision, for decisions made in this range.">
                            <dl className={styles.facts}>
                                <Fact label="Reviews" value={formatHours(data.turnaround.reviews_hours)}/>
                                <Fact label="Course files" value={formatHours(data.turnaround.course_files_hours)}/>
                                <Fact label="Reports" value={formatHours(data.turnaround.reports_hours)}/>
                                <Fact label="Professor requests" value={formatHours(data.turnaround.professor_requests_hours)}/>
                            </dl>
                        </Panel>
                        <Panel title="Moderator actions" description="Decisions logged in this range, by type.">
                            <BarList
                                items={data.moderation_actions.map(item => ({label: actionLabels[item.key] ?? item.key, value: item.count}))}
                                empty="No moderator actions in this range."
                            />
                        </Panel>
                    </div>

                    <SectionHeading title="Where reviews go"/>
                    <div className={styles.splitGrid}>
                        <Panel title="Reviews by university" description="Reviews written in this range, top 8.">
                            <BarList
                                items={data.reviews_by_university.map(item => ({label: item.key, value: item.count}))}
                                empty="No reviews in this range."
                            />
                        </Panel>
                        <Panel title="Most reviewed professors" description="Reviews written in this range.">
                            {data.top_professors.length === 0 ? (
                                <p className={styles.empty}>No reviews in this range.</p>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Professor</th>
                                            <th>University</th>
                                            <th>Reviews</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.top_professors.map(professor => (
                                            <tr key={professor.email}>
                                                <td>
                                                    <strong>{professor.name}</strong>
                                                    <span>{professor.email}</span>
                                                </td>
                                                <td>{professor.university}</td>
                                                <td>{formatNumber(professor.reviews)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </Panel>
                    </div>

                    <SectionHeading title="Traffic" note="Views and downloads are recorded per day from migration 000020 onward."/>
                    <section className={styles.kpis}>
                        <Kpi label="Professor page views" value={current.professor_views} previous={previous?.professor_views} compare={rangeOption.previous}/>
                        <Kpi label="Course page views" value={current.course_views} previous={previous?.course_views} compare={rangeOption.previous}/>
                        <Kpi label="File downloads" value={current.file_downloads} previous={previous?.file_downloads} compare={rangeOption.previous}/>
                        <Kpi label="New visitor sessions" value={current.sessions} previous={previous?.sessions} compare={rangeOption.previous}/>
                    </section>
                    <div className={styles.chartGrid}>
                        <LineChart
                            className={styles.wide}
                            title="Page views and downloads"
                            description="Professor and course page views, and course file downloads."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[
                                pick("Professor views", series[0], p => p.professor_views),
                                pick("Course views", series[1], p => p.course_views),
                                pick("File downloads", series[2], p => p.file_downloads),
                            ]}
                        />
                        <LineChart
                            className={styles.wide}
                            title="New visitor sessions"
                            description="New browser sessions. Session dates stopped being recorded in Aug 2025 and resume once migration 000019 is deployed."
                            labels={axis.labels}
                            tooltipLabels={axis.tooltips}
                            series={[pick("Sessions", series[0], p => p.sessions)]}
                        />
                    </div>

                    <SectionHeading title="All time" note="Includes views and downloads from before daily tracking started."/>
                    <section className={styles.kpis}>
                        <Stat label="Live reviews" value={formatNumber(data.totals.reviews)}/>
                        <Stat label="Professors" value={formatNumber(data.totals.professors)}/>
                        <Stat label="Courses" value={formatNumber(data.totals.courses)}/>
                        <Stat label="Course files" value={formatNumber(data.totals.course_files)}/>
                        <Stat label="Review votes" value={formatNumber(data.totals.ratings)}/>
                        <Stat label="Accounts" value={formatNumber(data.totals.users)}/>
                        <Stat label="Professor page views" value={formatNumber(data.totals.professor_views)}/>
                        <Stat label="Course page views" value={formatNumber(data.totals.course_views)}/>
                        <Stat label="File downloads" value={formatNumber(data.totals.file_downloads)}/>
                    </section>
                </div>
            )}
        </div>
    );
}

function Segmented<T extends string>({label, value, options, onChange}: {
    label: string;
    value: T;
    options: { key: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className={styles.segmented} role="radiogroup" aria-label={label}>
            {options.map(option => (
                <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={option.key === value}
                    className={cn(styles.segment, option.key === value && styles.segmentActive)}
                    onClick={() => onChange(option.key)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function Kpi({label, value, previous, compare}: { label: string; value: number; previous?: number; compare: string }) {
    const delta = previous === undefined ? null : changeOf(value, previous);
    return (
        <div className={styles.kpi}>
            <p className={styles.kpiLabel}>{label}</p>
            <p className={styles.kpiValue}>{formatNumber(value)}</p>
            {delta && (
                <p className={styles.kpiDelta} title={`${formatNumber(previous ?? 0)} in the ${compare}`}>
                    {delta.direction === "up" && <ArrowUpRight size={14} aria-hidden/>}
                    {delta.direction === "down" && <ArrowDownRight size={14} aria-hidden/>}
                    {delta.direction === "flat" && <Minus size={14} aria-hidden/>}
                    <strong>{delta.text}</strong>
                    <span>vs {compare}</span>
                </p>
            )}
        </div>
    );
}

function Stat({label, value, hint}: { label: string; value: string; hint?: string }) {
    return (
        <div className={styles.kpi}>
            <p className={styles.kpiLabel}>{label}</p>
            <p className={styles.kpiValue}>{value}</p>
            {hint && <p className={styles.kpiHint}>{hint}</p>}
        </div>
    );
}

function SectionHeading({title, note}: { title: string; note?: string }) {
    return (
        <div className={styles.sectionHeading}>
            <h2>{title}</h2>
            {note && <p>{note}</p>}
        </div>
    );
}

function Panel({title, description, className, children}: {
    title: string;
    description?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={cn(styles.panel, className)}>
            <h3>{title}</h3>
            {description && <p className={styles.panelDescription}>{description}</p>}
            {children}
        </section>
    );
}

function Fact({label, value, hint}: { label: string; value: string; hint?: string }) {
    return (
        <div className={styles.fact}>
            <dt>
                {label}
                {hint && <span>{hint}</span>}
            </dt>
            <dd>{value}</dd>
        </div>
    );
}

function BarList({items, empty}: { items: { label: string; value: number }[]; empty: string }) {
    if (items.length === 0) return <p className={styles.empty}>{empty}</p>;
    const max = Math.max(...items.map(item => item.value), 1);
    return (
        <ul className={styles.barList}>
            {items.map(item => (
                <li key={item.label}>
                    <div className={styles.barLabel}>
                        <span>{item.label}</span>
                        <strong>{formatNumber(item.value)}</strong>
                    </div>
                    <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{width: `${Math.max(1, (item.value / max) * 100)}%`}}/>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function changeOf(value: number, previous: number) {
    if (previous === 0) {
        return value === 0 ? {direction: "flat" as const, text: "No change"} : {direction: "up" as const, text: "New"};
    }
    const pct = ((value - previous) / previous) * 100;
    if (Math.abs(pct) < 0.5) return {direction: "flat" as const, text: "0%"};
    return {
        direction: pct > 0 ? "up" as const : "down" as const,
        text: `${pct > 0 ? "+" : "−"}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`,
    };
}

function formatHours(hours: number | null) {
    if (hours === null) return "—";
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
    return `${(hours / 24).toFixed(1)} days`;
}

function parseDay(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

const shortDay = new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric"});
const longDay = new Intl.DateTimeFormat("en-US", {weekday: "short", month: "short", day: "numeric", year: "numeric"});
const shortMonth = new Intl.DateTimeFormat("en-US", {month: "short", year: "numeric"});
const longMonth = new Intl.DateTimeFormat("en-US", {month: "long", year: "numeric"});

function axisLabel(start: string, bucket: AdminStatsBucket) {
    const date = parseDay(start);
    return bucket === "month" ? shortMonth.format(date) : shortDay.format(date);
}

function periodLabel(start: string, bucket: AdminStatsBucket) {
    const date = parseDay(start);
    if (bucket === "month") return longMonth.format(date);
    if (bucket === "week") {
        const end = new Date(date);
        end.setDate(end.getDate() + 6);
        return `Week of ${shortDay.format(date)} – ${shortDay.format(end)}, ${end.getFullYear()}`;
    }
    return longDay.format(date);
}
