import styles from "../../styles/components/preview_loading.module.scss";

/**
 * Loading indicator for file previews. The spinner only fades in if loading
 * takes longer than a moment, so fast loads show nothing; screen readers still
 * hear the label straight away.
 */
export default function PreviewLoading({label, className}: { label: string; className?: string }) {
    return (
        <div className={className} role="status">
            <span className={styles.spinner} aria-hidden="true"/>
            <span className={styles.visuallyHidden}>{label}</span>
        </div>
    );
}
