import flaggedImage from "../../assets/images/flagged_modal_image.png";
import type {ReviewPolicyWarning} from "../../typed/professor.ts";
import styles from "../../styles/components/global/modal.module.scss";

const reviewCheckImagePreloadId = "review-check-image-preload";
let reviewCheckImagePreloadStarted = false;

export function preloadFlaggedModalImage() {
    if (reviewCheckImagePreloadStarted) return;
    reviewCheckImagePreloadStarted = true;

    const link = document.getElementById(reviewCheckImagePreloadId) as HTMLLinkElement | null;
    if (!link) {
        const preload = document.createElement("link");
        preload.id = reviewCheckImagePreloadId;
        preload.rel = "preload";
        preload.as = "image";
        preload.href = flaggedImage;
        document.head.appendChild(preload);
    }

    const image = new Image();
    image.src = flaggedImage;
    if (image.decode) {
        void image.decode().catch(() => undefined);
    }
}

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
                <span className={styles.policyWarningBadge}>Review check</span>
                <div className={styles.policyWarningLayout}>
                    <div className={styles.policyWarningContent}>
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
                            loading="eager"
                            decoding="sync"
                            fetchPriority="high"
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
