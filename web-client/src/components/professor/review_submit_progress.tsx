import styles from "../../styles/components/professor/review_form.module.scss";

export default function ReviewSubmitProgress(props: { active: boolean; label: string }) {
    if (!props.active) return null;

    return (
        <div className={styles.submitProgress} role="status" aria-live="polite" aria-label={props.label}>
            <div className={styles.submitProgressTrack} aria-hidden="true">
                <div className={styles.submitProgressBar}/>
            </div>
            <p className={styles.submitProgressText}>{props.label}</p>
        </div>
    );
}
