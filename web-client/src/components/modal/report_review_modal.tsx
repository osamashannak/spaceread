import styles from "../../styles/components/global/modal.module.scss";
import {useEffect, useRef, useState} from "react";
import {reportReview} from "../../api/professor.ts";
import {useToast} from "../provider/toast.tsx";

const reportCategories = [
    "Personal attack or character insult",
    "Profanity, slurs, or abusive language",
    "Accusation of illegal conduct",
    "Allegation of bias or favoritism",
    "Fake-review manipulation claim",
    "Threat or intent to harm",
    "Privacy concern",
    "Spam, gibberish, duplicate, or not a genuine review",
    "Question rather than a review",
];

export default function ReportReviewModal(props: {
    reviewId: string,
    onClose: () => void,
}) {

    const [category, setCategory] = useState("");
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [details, setDetails] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    useEffect(() => {
        function closeOnOutsideClick(event: MouseEvent) {
            if (!dropdownRef.current?.contains(event.target as Node)) {
                setCategoryOpen(false);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => document.removeEventListener("mousedown", closeOnOutsideClick);
    }, []);

    async function submitReport() {
        if (!category) {
            toast.error("Select a report category.");
            return;
        }

        const trimmedDetails = details.trim();
        const reason = trimmedDetails ? `${category}: ${trimmedDetails}` : category;
        const response = await reportReview(props.reviewId, reason);

        if (!response) {
            toast.error("Failed to report review. Please try again later.");
            return;
        }

        props.onClose();
        toast.success("Report submitted.");
    }

    return (
        <div className={styles.background}>
            <div className={`${styles.modalBody} ${styles.reportModal}`}>
                <button aria-label="Close report modal" className={styles.reportCloseButton} type="button" onClick={props.onClose}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <rect width="24" height="24" fill="none"/>
                        <path fill="currentColor"
                              d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/>
                    </svg>
                </button>
                <div className={styles.reportHeader}>
                    <div className={styles.title}>
                        Report Review
                    </div>
                    <div className={styles.reportText}>
                        Select the issue that best matches this review.
                    </div>
                </div>
                <div className={styles.reportForm}>
                    <div className={styles.formField}>
                        <label className={styles.fieldLabel} htmlFor="review-report-category">Category</label>
                        <div
                            className={styles.categoryDropdown}
                            ref={dropdownRef}
                            onKeyDown={event => {
                                if (event.key === "Escape") {
                                    setCategoryOpen(false);
                                }
                            }}
                        >
                            <button
                                aria-expanded={categoryOpen}
                                aria-haspopup="listbox"
                                className={`${styles.dropdownButton} ${!category ? styles.dropdownPlaceholder : ""}`}
                                id="review-report-category"
                                type="button"
                                onClick={() => setCategoryOpen(open => !open)}
                            >
                                <span>{category || "Select a category"}</span>
                                <svg aria-hidden="true" viewBox="0 0 20 20">
                                    <path d="M5 7.5L10 12.5L15 7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
                                </svg>
                            </button>
                            {categoryOpen && (
                                <div aria-labelledby="review-report-category" className={styles.dropdownMenu} role="listbox">
                                    {reportCategories.map(option => (
                                        <button
                                            aria-selected={category === option}
                                            className={`${styles.dropdownOption} ${category === option ? styles.dropdownOptionSelected : ""}`}
                                            key={option}
                                            role="option"
                                            type="button"
                                            onClick={() => {
                                                setCategory(option);
                                                setCategoryOpen(false);
                                            }}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={styles.formField}>
                        <div className={styles.fieldLabelRow}>
                            <label className={styles.fieldLabel} htmlFor="review-report-details">Details</label>
                            <span>Optional</span>
                        </div>
                        <textarea
                            className={styles.textArea}
                            id="review-report-details"
                            placeholder="Add context for moderators."
                            value={details}
                            onChange={event => setDetails(event.target.value)}
                        />
                    </div>
                </div>
                <div className={`${styles.modalButtons} ${styles.reportActions}`}>
                    <button className={`${styles.buttonOk} ${styles.secondaryButton}`} type="button" onClick={props.onClose}>Cancel</button>
                    <button className={`${styles.buttonOk} ${styles.primaryButton}`} type="button" onClick={submitReport}>Report
                    </button>
                </div>
            </div>
        </div>
    )

}
