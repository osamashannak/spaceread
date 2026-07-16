import styles from "../../styles/components/professor/review_form.module.scss";

export default function ReviewSubmittedNotice(props: { justSubmitted: boolean }) {
    return (
        <section className={styles.reviewSubmittedNotice} aria-live="polite">
            <div className={styles.reviewSubmittedIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M20 6 9 17l-5-5"/>
                </svg>
            </div>
            <div>
                <h2>{props.justSubmitted ? "Review posted" : "Review already submitted"}</h2>
                <p>
                    {props.justSubmitted
                        ? "Thanks for sharing your experience."
                        : "Thanks, your review is already on this professor's page."}
                </p>
            </div>
        </section>
    );
}
