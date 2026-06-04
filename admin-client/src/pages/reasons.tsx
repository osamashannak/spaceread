import {type ReactNode, useEffect, useMemo, useState} from "react";
import {LoaderCircle, RefreshCw, RotateCcw, Save} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    type AdminReason,
    listAdminReasons,
    updateAdminReason,
} from "@/lib/admin_api";
import styles from "./reasons.module.scss";

type ReasonDraft = {
    code: string;
    label: string;
    policy_area: string;
    policy_reference: string;
    active: boolean;
    sort_order: string;
};

type ReasonRow = {
    originalCode: string;
    reason: AdminReason;
    draft: ReasonDraft;
    saving: boolean;
    error: string;
    message: string;
};

const codePattern = /^[a-z0-9_]+$/;

export function ReasonsPage() {
    const [rows, setRows] = useState<ReasonRow[]>([]);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [isRefreshing, setIsRefreshing] = useState(false);

    function loadReasons(mode: "initial" | "refresh" = "initial") {
        if (mode === "initial") {
            setLoadState("loading");
        } else {
            setIsRefreshing(true);
        }

        const controller = new AbortController();
        listAdminReasons(controller.signal)
            .then(response => {
                setRows(response.reasons.map(reason => ({
                    originalCode: reason.code,
                    reason,
                    draft: draftFromReason(reason),
                    saving: false,
                    error: "",
                    message: "",
                })));
                setLoadState("ready");
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                setLoadState("error");
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsRefreshing(false);
                }
            });

        return () => controller.abort();
    }

    useEffect(() => loadReasons("initial"), []);

    const activeCount = useMemo(() => rows.filter(row => row.draft.active).length, [rows]);

    function updateDraft(originalCode: string, patch: Partial<ReasonDraft>) {
        setRows(current => current.map(row => (
            row.originalCode === originalCode
                ? {...row, draft: {...row.draft, ...patch}, error: "", message: ""}
                : row
        )));
    }

    function resetDraft(originalCode: string) {
        setRows(current => current.map(row => (
            row.originalCode === originalCode
                ? {...row, draft: draftFromReason(row.reason), error: "", message: ""}
                : row
        )));
    }

    async function saveReason(row: ReasonRow) {
        const validation = validateDraft(row.draft);
        if (validation) {
            setRows(current => current.map(item => (
                item.originalCode === row.originalCode ? {...item, error: validation, message: ""} : item
            )));
            return;
        }

        setRows(current => current.map(item => (
            item.originalCode === row.originalCode ? {...item, saving: true, error: "", message: ""} : item
        )));

        try {
            const response = await updateAdminReason(row.originalCode, {
                code: row.draft.code.trim(),
                label: row.draft.label.trim(),
                policy_area: row.draft.policy_area.trim(),
                policy_reference: row.draft.policy_reference.trim() || undefined,
                active: row.draft.active,
                sort_order: Number.parseInt(row.draft.sort_order, 10),
            });

            window.dispatchEvent(new CustomEvent("admin-reasons-updated", {detail: response.reason}));
            setRows(current => sortRows(current.map(item => (
                item.originalCode === row.originalCode
                    ? {
                        originalCode: response.reason.code,
                        reason: response.reason,
                        draft: draftFromReason(response.reason),
                        saving: false,
                        error: "",
                        message: "Saved.",
                    }
                    : item
            ))));
        } catch (err) {
            setRows(current => current.map(item => (
                item.originalCode === row.originalCode
                    ? {
                        ...item,
                        saving: false,
                        error: err instanceof Error ? err.message : "Could not save reason.",
                    }
                    : item
            )));
        }
    }

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <div>
                    <p className={styles.eyebrow}>Moderation</p>
                    <h1 className={styles.title}>Policy reasons</h1>
                    <p className={styles.description}>{activeCount} active reasons available in review decisions.</p>
                </div>
                <Button disabled={isRefreshing} type="button" variant="outline" onClick={() => loadReasons("refresh")}>
                    <RefreshCw size={16}/>
                    Refresh
                </Button>
            </section>

            {loadState === "loading" && (
                <div className={styles.stateNotice}>
                    <LoaderCircle className={styles.spin} size={18}/>
                    <strong>Loading reasons</strong>
                </div>
            )}

            {loadState === "error" && (
                <div className={styles.stateNotice}>
                    <strong>Reasons could not be loaded</strong>
                    <Button type="button" variant="outline" onClick={() => loadReasons("initial")}>Retry</Button>
                </div>
            )}

            {loadState === "ready" && (
                <section className={styles.reasonTable}>
                    <div className={styles.headerRow}>
                        <span>Code</span>
                        <span>Label</span>
                        <span>Policy area</span>
                        <span>Reference</span>
                        <span>Status</span>
                        <span>Order</span>
                        <span>Actions</span>
                    </div>
                    {rows.map(row => {
                        const dirty = isDirty(row);
                        return (
                            <form className={styles.reasonRow} key={row.originalCode} onSubmit={event => {
                                event.preventDefault();
                                void saveReason(row);
                            }}>
                                <Field label="Code">
                                    <Input
                                        aria-label={`${row.reason.label} code`}
                                        disabled={row.saving}
                                        value={row.draft.code}
                                        onChange={event => updateDraft(row.originalCode, {code: event.target.value})}
                                    />
                                </Field>
                                <Field label="Label">
                                    <Input
                                        aria-label={`${row.reason.code} label`}
                                        disabled={row.saving}
                                        value={row.draft.label}
                                        onChange={event => updateDraft(row.originalCode, {label: event.target.value})}
                                    />
                                </Field>
                                <Field label="Policy area">
                                    <Input
                                        aria-label={`${row.reason.code} policy area`}
                                        disabled={row.saving}
                                        value={row.draft.policy_area}
                                        onChange={event => updateDraft(row.originalCode, {policy_area: event.target.value})}
                                    />
                                </Field>
                                <Field label="Reference">
                                    <Input
                                        aria-label={`${row.reason.code} policy reference`}
                                        disabled={row.saving}
                                        value={row.draft.policy_reference}
                                        onChange={event => updateDraft(row.originalCode, {policy_reference: event.target.value})}
                                    />
                                </Field>
                                <div className={styles.statusCell}>
                                    <label className={styles.toggle}>
                                        <input
                                            checked={row.draft.active}
                                            disabled={row.saving}
                                            type="checkbox"
                                            onChange={event => updateDraft(row.originalCode, {active: event.target.checked})}
                                        />
                                        <Badge variant={row.draft.active ? "success" : "outline"}>
                                            {row.draft.active ? "Active" : "Inactive"}
                                        </Badge>
                                    </label>
                                </div>
                                <Field label="Order">
                                    <Input
                                        aria-label={`${row.reason.code} sort order`}
                                        disabled={row.saving}
                                        inputMode="numeric"
                                        type="number"
                                        value={row.draft.sort_order}
                                        onChange={event => updateDraft(row.originalCode, {sort_order: event.target.value})}
                                    />
                                </Field>
                                <div className={styles.actions}>
                                    <Button disabled={!dirty || row.saving} size="sm" type="submit">
                                        {row.saving ? <LoaderCircle className={styles.spin} size={15}/> : <Save size={15}/>}
                                        Save
                                    </Button>
                                    <Button disabled={!dirty || row.saving} size="sm" type="button" variant="outline" onClick={() => resetDraft(row.originalCode)}>
                                        <RotateCcw size={15}/>
                                        Reset
                                    </Button>
                                </div>
                                {(row.error || row.message) && (
                                    <p className={row.error ? styles.errorLine : styles.successLine}>
                                        {row.error || row.message}
                                    </p>
                                )}
                            </form>
                        );
                    })}
                </section>
            )}
        </div>
    );
}

function Field({label, children}: { label: string; children: ReactNode }) {
    return (
        <label className={styles.field}>
            <span>{label}</span>
            {children}
        </label>
    );
}

function draftFromReason(reason: AdminReason): ReasonDraft {
    return {
        code: reason.code,
        label: reason.label,
        policy_area: reason.policy_area,
        policy_reference: reason.policy_reference || "",
        active: reason.active,
        sort_order: String(reason.sort_order),
    };
}

function isDirty(row: ReasonRow) {
    const draft = draftFromReason(row.reason);
    return (
        row.draft.code !== draft.code ||
        row.draft.label !== draft.label ||
        row.draft.policy_area !== draft.policy_area ||
        row.draft.policy_reference !== draft.policy_reference ||
        row.draft.active !== draft.active ||
        row.draft.sort_order !== draft.sort_order
    );
}

function sortRows(rows: ReasonRow[]) {
    return [...rows].sort((a, b) => (
        Number.parseInt(a.draft.sort_order, 10) - Number.parseInt(b.draft.sort_order, 10) ||
        a.draft.code.localeCompare(b.draft.code)
    ));
}

function validateDraft(draft: ReasonDraft) {
    if (!codePattern.test(draft.code.trim())) return "Code can use lowercase letters, numbers, and underscores.";
    if (!draft.label.trim()) return "Label is required.";
    if (!draft.policy_area.trim()) return "Policy area is required.";
    const sortOrder = Number.parseInt(draft.sort_order, 10);
    if (!Number.isFinite(sortOrder) || sortOrder < 0) return "Order must be zero or greater.";
    return "";
}
