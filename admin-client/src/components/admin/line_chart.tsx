import {type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState} from "react";
import {ChartLine, Table} from "lucide-react";
import {cn} from "@/lib/utils";
import styles from "./line_chart.module.scss";

export type LineSeries = {
    key: string;
    label: string;
    color: string;
    values: (number | null)[];
};

interface LineChartProps {
    title: string;
    description?: string;
    labels: string[];
    tooltipLabels: string[];
    series: LineSeries[];
    formatValue?: (value: number) => string;
    formatAxis?: (value: number) => string;
    maxValue?: number;
    height?: number;
    className?: string;
}

const pad = {top: 12, right: 12, bottom: 28, left: 44};
const defaultFormat = (value: number) => value.toLocaleString("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {notation: "compact", maximumFractionDigits: 1});

export function LineChart({
    title,
    description,
    labels,
    tooltipLabels,
    series,
    formatValue = defaultFormat,
    formatAxis = value => compactFormat.format(value),
    maxValue,
    height = 220,
    className,
}: LineChartProps) {
    const frameRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(600);
    const [active, setActive] = useState<number | null>(null);
    const [view, setView] = useState<"chart" | "table">("chart");

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const observer = new ResizeObserver(entries => {
            const next = Math.floor(entries[0].contentRect.width);
            if (next > 0) setWidth(next);
        });
        observer.observe(frame);
        return () => observer.disconnect();
    }, [view]);

    const count = labels.length;
    const plotWidth = Math.max(10, width - pad.left - pad.right);
    const plotHeight = height - pad.top - pad.bottom;

    const yMax = useMemo(() => {
        if (maxValue !== undefined) return maxValue;
        const peak = Math.max(0, ...series.flatMap(s => s.values.filter((v): v is number => v !== null)));
        return niceCeiling(peak);
    }, [series, maxValue]);

    const x = (index: number) => pad.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
    const y = (value: number) => pad.top + plotHeight - (yMax === 0 ? 0 : (value / yMax) * plotHeight);

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(fraction => yMax * fraction);
    const xTicks = useMemo(() => pickTicks(count, Math.max(2, Math.floor(plotWidth / 90))), [count, plotWidth]);

    function handlePointer(event: PointerEvent<SVGRectElement>) {
        if (count === 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const offset = event.clientX - bounds.left;
        const index = count <= 1 ? 0 : Math.round((offset / bounds.width) * (count - 1));
        setActive(Math.min(count - 1, Math.max(0, index)));
    }

    function handleKey(event: KeyboardEvent<SVGSVGElement>) {
        if (count === 0) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            setActive(current => Math.min(count - 1, Math.max(0, (current ?? (step > 0 ? -1 : count)) + step)));
        } else if (event.key === "Escape") {
            setActive(null);
        }
    }

    const tooltipLeft = active === null ? 0 : x(active);
    const tooltipOnLeft = active !== null && tooltipLeft > width * 0.6;

    return (
        <section className={cn(styles.card, className)}>
            <header className={styles.header}>
                <div>
                    <h3 className={styles.title}>{title}</h3>
                    {description && <p className={styles.description}>{description}</p>}
                </div>
                <button
                    type="button"
                    className={styles.viewToggle}
                    onClick={() => setView(current => (current === "chart" ? "table" : "chart"))}
                    aria-label={view === "chart" ? `Show ${title} as a table` : `Show ${title} as a chart`}
                >
                    {view === "chart" ? <Table size={14}/> : <ChartLine size={14}/>}
                    {view === "chart" ? "Table" : "Chart"}
                </button>
            </header>

            {series.length > 1 && (
                <ul className={styles.legend}>
                    {series.map(s => (
                        <li key={s.key}>
                            <span className={styles.legendKey} style={{background: s.color}}/>
                            {s.label}
                        </li>
                    ))}
                </ul>
            )}

            {view === "table" ? (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Period</th>
                                {series.map(s => <th key={s.key}>{s.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {tooltipLabels.map((label, index) => (
                                <tr key={label}>
                                    <td>{label}</td>
                                    {series.map(s => (
                                        <td key={s.key}>{s.values[index] === null ? "—" : formatValue(s.values[index] as number)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className={styles.frame} ref={frameRef} style={{height}}>
                    <svg
                        width={width}
                        height={height}
                        role="img"
                        aria-label={`${title} line chart. Use the left and right arrow keys to read values.`}
                        tabIndex={0}
                        onKeyDown={handleKey}
                        onBlur={() => setActive(null)}
                        className={styles.svg}
                    >
                        {yTicks.map(tick => (
                            <g key={tick}>
                                <line className={styles.grid} x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)}/>
                                <text className={styles.axisLabel} x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                                    {formatAxis(tick)}
                                </text>
                            </g>
                        ))}
                        {xTicks.map(index => (
                            <text
                                key={index}
                                className={styles.axisLabel}
                                x={x(index)}
                                y={height - 8}
                                textAnchor={index === 0 && count > 1 ? "start" : index === count - 1 && count > 1 ? "end" : "middle"}
                            >
                                {labels[index]}
                            </text>
                        ))}

                        {series.map(s => (
                            <g key={s.key}>
                                {segments(s.values).map((segment, i) => (
                                    segment.length === 1 ? (
                                        <circle key={i} cx={x(segment[0])} cy={y(s.values[segment[0]] as number)} r={3} fill={s.color}/>
                                    ) : (
                                        <path
                                            key={i}
                                            className={styles.line}
                                            stroke={s.color}
                                            d={segment.map((index, j) => `${j === 0 ? "M" : "L"}${x(index)},${y(s.values[index] as number)}`).join(" ")}
                                        />
                                    )
                                ))}
                            </g>
                        ))}

                        {active !== null && (
                            <g>
                                <line className={styles.crosshair} x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotHeight}/>
                                {series.map(s => s.values[active] === null ? null : (
                                    <circle
                                        key={s.key}
                                        className={styles.marker}
                                        cx={x(active)}
                                        cy={y(s.values[active] as number)}
                                        r={4}
                                        fill={s.color}
                                    />
                                ))}
                            </g>
                        )}

                        <rect
                            x={pad.left}
                            y={pad.top}
                            width={plotWidth}
                            height={plotHeight}
                            fill="transparent"
                            onPointerMove={handlePointer}
                            onPointerLeave={() => setActive(null)}
                        />
                    </svg>

                    {active !== null && (
                        <div
                            className={styles.tooltip}
                            style={{
                                left: tooltipOnLeft ? undefined : tooltipLeft + 12,
                                right: tooltipOnLeft ? width - tooltipLeft + 12 : undefined,
                            }}
                            role="status"
                        >
                            <p className={styles.tooltipTitle}>{tooltipLabels[active]}</p>
                            {series.map(s => (
                                <p key={s.key} className={styles.tooltipRow}>
                                    <span className={styles.tooltipKey} style={{background: s.color}}/>
                                    <strong>{s.values[active] === null ? "—" : formatValue(s.values[active] as number)}</strong>
                                    <span>{s.label}</span>
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

// Splits a series into runs of non-null indexes so gaps stay visible.
function segments(values: (number | null)[]) {
    const runs: number[][] = [];
    let current: number[] = [];
    values.forEach((value, index) => {
        if (value === null) {
            if (current.length) runs.push(current);
            current = [];
        } else {
            current.push(index);
        }
    });
    if (current.length) runs.push(current);
    return runs;
}

function pickTicks(count: number, maxTicks: number) {
    if (count === 0) return [];
    if (count <= maxTicks) return Array.from({length: count}, (_, i) => i);
    const step = Math.ceil((count - 1) / (maxTicks - 1));
    const ticks: number[] = [];
    for (let i = 0; i < count; i += step) ticks.push(i);
    if (count - 1 - ticks[ticks.length - 1] < step / 2) ticks.pop();
    ticks.push(count - 1);
    return ticks;
}

export function niceCeiling(value: number) {
    if (value <= 0) return 4;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    for (const multiplier of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) {
        const candidate = multiplier * magnitude;
        if (candidate >= value && Number.isInteger(candidate / 4)) return candidate;
    }
    return Math.ceil(value / magnitude) * magnitude;
}
