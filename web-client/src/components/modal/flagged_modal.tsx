import flaggedImage from "../../assets/images/flagged_modal_image.png";
import type {ReviewPolicyWarning} from "../../typed/professor.ts";
import styles from "../../styles/components/global/modal.module.scss";

export default function FlaggedModal(props: {
    warning?: ReviewPolicyWarning;
    finalizeSubmission: () => void;
    editReview: () => void;
    onClose: () => void;
}) {
    const title = props.warning?.title || "Want to take another look?";
    const message = props.warning?.message || "Some of the wording in your review might come across as offensive and inappropriate. If that wasn't your intention, you can edit it and try again.";

    return (
        <div className={styles.background}>
            <div className={`${styles.modalBody} ${styles.policyWarningModal}`}>
                <div className={styles.policyWarningLayout}>
                    <div className={styles.policyWarningContent}>
                        <span className={styles.policyWarningBadge}>Review check</span>
                        <h2>{title}</h2>
                        <p>{message}</p>
                    </div>

                    <div className={styles.policyWarningImageWrap}>
                        <img
                            src={flaggedImage}
                            alt="Review illustration"
                            className={styles.policyWarningImage}
                            width={160}
                            height={160}
                        />
                    </div>
                </div>
                <div className={`${styles.modalButtons} ${styles.policyWarningActions}`}>
                    <button className={styles.buttonOk} onClick={() => {
                        props.editReview();
                        props.onClose();
                    }}>Edit review</button>
                    <button className={styles.buttonRed} onClick={() => {
                        props.finalizeSubmission();
                        props.onClose();
                    }}>Post anyway</button>
                </div>
            </div>
        </div>
    );
}
