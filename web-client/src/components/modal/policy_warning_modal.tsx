import {ReviewPolicyWarning} from "../../typed/professor.ts";
import styles from "../../styles/components/global/modal.module.scss";

export default function PolicyWarningModal(props: {
    warning: ReviewPolicyWarning;
    editReview: () => void;
    postAnyway: () => void;
    onClose: () => void;
}) {
    return (
        <div className={styles.background}>
            <div className={`${styles.modalBody} ${styles.policyWarningModal}`} onClick={(event) => event.stopPropagation()}>
                <div className={styles.policyWarningIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M12 3.5 21 19H3L12 3.5Z"/>
                        <path d="M12 8.5v5"/>
                        <path d="M12 16.5h.01"/>
                    </svg>
                </div>

                <div className={styles.policyWarningContent}>
                    <span className={styles.policyWarningBadge}>Policy check</span>
                    <h2>{props.warning.title || "This may need careful wording"}</h2>
                    <p>{props.warning.message}</p>
                </div>

                <div className={`${styles.modalButtons} ${styles.policyWarningActions}`}>
                    <button className={styles.buttonOk} onClick={() => {
                        props.editReview();
                        props.onClose();
                    }}>Edit review</button>
                    <button className={styles.buttonRed} onClick={() => {
                        props.onClose();
                        props.postAnyway();
                    }}>Post anyway</button>
                </div>
            </div>
        </div>
    );
}
