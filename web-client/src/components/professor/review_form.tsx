import {type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useGoogleReCaptcha} from "react-google-recaptcha-v3";
import styles from "../../styles/components/professor/review_form.module.scss";
import {ReviewAPI, ReviewFormDraft} from "../../typed/professor.ts";
import {deleteReview, postReview, uploadImageAttachment} from "../../api/professor.ts";
import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {ContentEditable} from "@lexical/react/LexicalContentEditable";
import {HistoryPlugin} from "@lexical/react/LexicalHistoryPlugin";
import {EmojiNode} from "../lexical_editor/emoji_node.ts";
import CustomPlainTextPlugin from "../lexical_editor/custom_plaintext_plugin.tsx";
import {OnChangePlugin} from "@lexical/react/LexicalOnChangePlugin";
import {$getRoot, LexicalEditor} from "lexical";
import {EditorRefPlugin} from "@lexical/react/LexicalEditorRefPlugin";
import ReviewFormFooter from "./review_form_footer.tsx";
import {useDispatch} from "react-redux";
import {addReview} from "../../redux/slice/professor_slice.ts";
import EmojiSelector from "../lexical_editor/emoji_selector.tsx";
import ReviewAttachment from "./review_attachment.tsx";
import ReviewSubmittedNotice from "./review_submitted_notice.tsx";
import ReviewSubmitProgress from "./review_submit_progress.tsx";
import {useModal} from "../provider/modal.tsx";
import FlaggedModal, {preloadFlaggedModalImage} from "../modal/flagged_modal.tsx";
import {getRecaptchaToken} from "../../lib/recaptcha.ts";
import {useToast} from "../provider/toast.tsx";
import {getCoursesList} from "../../api/course.ts";
import type {CourseItem} from "../../typed/searchbox.ts";
import {createSearchIndex, searchPreparedIndex} from "../../lib/search.ts";
import {trackGifEvent} from "../../lib/klipy.ts";
import {collectReviewClientFingerprint} from "../../lib/browser_fingerprint.ts";

// Helper to calculate star label
const getStarLabel = (r: number) => {
    if (r === 0) return "";
    if (r <= 2) return "Bad";
    if (r <= 3) return "Okay";
    if (r <= 4) return "Good";
    return "Amazing";
};

const ratingOptions = [1, 2, 3, 4, 5];
const DEFAULT_PROFESSOR_COURSE_LIMIT = 12;
const PROFESSOR_COURSE_SEARCH_LIMIT = 6;
const CATALOG_COURSE_SEARCH_LIMIT = 8;
const COURSE_SUGGESTION_LIMIT = 12;

function normalizeCourseTag(value: string): string {
    return value.replace(/\s+/g, "").toUpperCase();
}

function uniqueCoursesByTag(courses: CourseItem[]): CourseItem[] {
    const seen = new Set<string>();
    const uniqueCourses: CourseItem[] = [];

    for (const course of courses) {
        const tag = normalizeCourseTag(course.tag);
        if (!tag || seen.has(tag)) continue;

        seen.add(tag);
        uniqueCourses.push({
            ...course,
            tag,
        });
    }

    return uniqueCourses;
}

function StarIcon(props: { filled: boolean }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path
                d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                fill={props.filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.5"
            />
        </svg>
    );
}

function AccessibleRating(props: {
    value: number | undefined;
    onChange: (value: number) => void;
    invalid: boolean;
    errorId?: string;
}) {
    const moveRating = (currentValue: number | undefined, direction: 1 | -1) => {
        const currentIndex = currentValue ? ratingOptions.indexOf(currentValue) : -1;
        const nextIndex = (currentIndex + direction + ratingOptions.length) % ratingOptions.length;
        const nextValue = ratingOptions[nextIndex];

        props.onChange(nextValue);
        window.requestAnimationFrame(() => {
            document.getElementById(`review-rating-${nextValue}`)?.focus();
        });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: number) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            moveRating(option, 1);
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            moveRating(option, -1);
        }

        if (event.key === "Home") {
            event.preventDefault();
            props.onChange(1);
            window.requestAnimationFrame(() => document.getElementById("review-rating-1")?.focus());
        }

        if (event.key === "End") {
            event.preventDefault();
            props.onChange(5);
            window.requestAnimationFrame(() => document.getElementById("review-rating-5")?.focus());
        }
    };

    const ratingLabel = props.value ? getStarLabel(props.value) : "Select a rating";

    return (
        <fieldset
            className={styles.formFieldset}
            id="field-score"
            aria-invalid={props.invalid || undefined}
            aria-describedby={props.errorId}
        >
            {props.invalid && (
                <div id={props.errorId} className={styles.errorTooltip} role="alert">
                    Rating required
                </div>
            )}

            <legend className={styles.inputTitle}>Overall rating</legend>
            <div className={styles.ratingControl}>
                <div className={styles.starRatingGroup} role="radiogroup" aria-label="Overall rating">
                    {ratingOptions.map(option => {
                        const checked = props.value === option;
                        const filled = props.value ? option <= props.value : false;
                        const label = `${option} ${option === 1 ? "star" : "stars"}, ${getStarLabel(option)}`;

                        return (
                            <button
                                key={option}
                                id={`review-rating-${option}`}
                                type="button"
                                role="radio"
                                aria-checked={checked}
                                aria-label={label}
                                tabIndex={checked || (!props.value && option === 1) ? 0 : -1}
                                className={`${styles.starRatingButton} ${filled ? styles.starRatingButtonActive : ""}`}
                                onClick={() => props.onChange(option)}
                                onKeyDown={event => handleKeyDown(event, option)}
                            >
                                <StarIcon filled={filled}/>
                            </button>
                        );
                    })}
                </div>
                <span className={styles.ratingLabel} aria-live="polite">
                    {ratingLabel}
                </span>
            </div>
        </fieldset>
    );
}

export default function ReviewForm(props: { courses: string[] | null, professorEmail: string; canReview: boolean }) {
    const [details, setDetails] = useState<ReviewFormDraft>({
        score: undefined,
        comment: "",
        positive: undefined,
        attachment: undefined,
        course_taken: "",
        grade_received: "",
    });

    const [submitting, setSubmitting] = useState<boolean | null | "error">(
        !props.canReview ? null : false
    );
    const [showCourseMenu, setShowCourseMenu] = useState(false);
    const [courseCatalog, setCourseCatalog] = useState<CourseItem[]>([]);
    const [courseCatalogLoaded, setCourseCatalogLoaded] = useState(false);
    const [courseCatalogLoading, setCourseCatalogLoading] = useState(false);
    const [mode, setMode] = useState<"GUEST" | "VERIFIED">(localStorage.getItem("is_verified_student") === "true" ? "VERIFIED" : "GUEST");
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [submitProgressLabel, setSubmitProgressLabel] = useState("Posting review...");
    const {executeRecaptcha} = useGoogleReCaptcha();

    const [activeError, setActiveError] = useState<string | null>(null);

    const commentRef = useRef<LexicalEditor | null | undefined>(null);
    const dispatch = useDispatch();
    const comboboxRef = useRef<HTMLDivElement>(null);
    const reviewRef = useRef<ReviewAPI | null>(null);
    const courseCatalogRequestRef = useRef<Promise<void> | null>(null);

    const attachmentUploadRef = useRef<Promise<string | undefined> | null>(null);
    const lastAttachmentUploadErrorToastAt = useRef(0);

    const modal = useModal();
    const {error: showToastError} = useToast();

    useEffect(() => {
        if (props.canReview) {
            preloadFlaggedModalImage();
        }
    }, [props.canReview]);

    const professorCourseTags = useMemo(
        () => Array.from(new Set((props.courses || []).map(normalizeCourseTag).filter(Boolean))),
        [props.courses]
    );

    const courseCatalogByTag = useMemo(() => {
        const coursesByTag = new Map<string, CourseItem>();
        for (const course of courseCatalog) {
            coursesByTag.set(normalizeCourseTag(course.tag), course);
        }
        return coursesByTag;
    }, [courseCatalog]);

    const professorCourseItems = useMemo<CourseItem[]>(
        () => professorCourseTags.map(tag => {
            const catalogCourse = courseCatalogByTag.get(tag);
            return {
                tag,
                name: catalogCourse?.name ?? "",
            };
        }),
        [courseCatalogByTag, professorCourseTags]
    );

    const professorCourseIndex = useMemo(
        () => createSearchIndex(professorCourseItems, "course"),
        [professorCourseItems]
    );

    const catalogCourseIndex = useMemo(
        () => createSearchIndex(courseCatalog, "course"),
        [courseCatalog]
    );

    const courseSuggestions = useMemo<CourseItem[]>(() => {
        const query = details.course_taken.trim();

        if (!query) {
            return professorCourseItems.slice(0, DEFAULT_PROFESSOR_COURSE_LIMIT);
        }

        const professorMatches = searchPreparedIndex(
            professorCourseIndex,
            query,
            PROFESSOR_COURSE_SEARCH_LIMIT
        ) as CourseItem[];
        const professorTags = new Set(professorCourseItems.map(course => normalizeCourseTag(course.tag)));

        const catalogMatches = (searchPreparedIndex(
            catalogCourseIndex,
            query,
            CATALOG_COURSE_SEARCH_LIMIT + professorMatches.length
        ) as CourseItem[]).filter(course => !professorTags.has(normalizeCourseTag(course.tag)));

        return uniqueCoursesByTag([...professorMatches, ...catalogMatches]).slice(0, COURSE_SUGGESTION_LIMIT);
    }, [catalogCourseIndex, details.course_taken, professorCourseIndex, professorCourseItems]);

    const ensureCourseCatalogLoaded = useCallback(() => {
        if (courseCatalogLoaded || courseCatalogRequestRef.current) return;

        setCourseCatalogLoading(true);
        const request = getCoursesList()
            .then(courses => {
                if (courses) {
                    setCourseCatalog(uniqueCoursesByTag(courses));
                    setCourseCatalogLoaded(true);
                }
            })
            .finally(() => {
                setCourseCatalogLoading(false);
                courseCatalogRequestRef.current = null;
            });

        courseCatalogRequestRef.current = request;
    }, [courseCatalogLoaded]);

    const clearError = () => {
        if (activeError) setActiveError(null);
    };

    const showAttachmentUploadError = useCallback(() => {
        const now = Date.now();
        if (now - lastAttachmentUploadErrorToastAt.current < 1500) return;

        lastAttachmentUploadErrorToastAt.current = now;
        showToastError("Attachment failed to upload. Try again.");
    }, [showToastError]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
                setShowCourseMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (showCourseMenu) {
            ensureCourseCatalogLoaded();
        }
    }, [ensureCourseCatalogLoaded, showCourseMenu]);

    useEffect(() => {
        const handleStorageChange = () => {
            const isVerified = localStorage.getItem("is_verified_student") === "true";
            if (isVerified && mode === 'GUEST') {
                setMode('VERIFIED');
            }
        };
        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, [mode]);

    useEffect(() => {
        if (details.attachment && activeError === 'comment') {
            setActiveError(null);
        }
    }, [details.attachment, activeError]);

    useEffect(() => {
        const att = details.attachment;
        if (!att) {
            attachmentUploadRef.current = null;
            return;
        }

        if (att.id && att.id !== "READY" && att.id !== "UPLOADING") {
            attachmentUploadRef.current = Promise.resolve(att.id);
            return;
        }

        if (att.id === "READY") {
            attachmentUploadRef.current = uploadImageAttachment(att.src)
                .then((id) => {
                    if (!id) throw new Error("upload failed");
                    setDetails(prev =>
                        prev.attachment ? {...prev, attachment: {...prev.attachment, id}} : prev
                    );
                    return id;
                })
                .catch(() => {
                    showAttachmentUploadError();
                    setDetails(prev => ({...prev, attachment: undefined}));
                    return undefined;
                });

            setDetails(prev =>
                prev.attachment ? { ...prev, attachment: { ...prev.attachment, id: "UPLOADING" } } : prev
            );
        }
    }, [details.attachment?.src, showAttachmentUploadError])

    async function ensureAttachmentUploaded(): Promise<string | undefined> {
        const att = details.attachment;
        if (!att) return undefined;

        if (att.id && att.id !== "UPLOADING" && att.id !== "READY") {
            return att.id;
        }

        let attempts = 0;
        while (!attachmentUploadRef.current && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 100)); // wait 100ms
            attempts++;
        }

        const p = attachmentUploadRef.current;
        if (!p) {
            console.error("Upload promise never initialized.");
            return undefined;
        }

        return await p;
    }

    function finalizeSubmission() {
        const review = reviewRef.current;
        if (!review) {
            setSubmitting("error");
            return;
        }
        trackGifEvent(details.gif, "onsent");
        setSubmitting(null);
        dispatch(
            addReview({
                sort_index: review.sort_index,
                uaeu_origin: review.uaeu_origin,
                fadeIn: true,
                self: true,
                rated: null,
                reply_count: 0,
                language: review.language,
                attachment: details.attachment,
                author: "User",
                created_at: review.created_at,
                dislike_count: 0,
                like_count: 0,
                text: review.text ?? "",
                score: review.score,
                grade_received: review.grade_received,
                course_taken: review.course_taken,
                positive: review.positive,
                id: review.id,
                gif: details.gif ? details.gif.url : undefined,
                flagged: !!review.flagged,
                verified: review.verified
            })
        );
    }

    function editReview() {
        const review = reviewRef.current;
        if (!review) return;
        (async () => {
            await deleteReview(review.id);
        })()
        reviewRef.current = null;
        setSubmitProgressLabel("Posting review...");
        setSubmitting(false);
    }

    async function submitReview() {
        setActiveError(null);
        let firstErrorField = null;

        const hasText = details.comment && details.comment.trim().length > 0;
        const hasAttachment = !!details.attachment;
        if (!hasText && !hasAttachment) {
            firstErrorField = 'comment';
        }

        if (!firstErrorField && !details.score) {
            firstErrorField = 'score';
        }

        if (!firstErrorField && props.professorEmail.endsWith('@uaeu.ac.ae')) {
            const courseRegex = /^[A-Z]{3,4}\d{3}$/;
            if (!details.course_taken || !courseRegex.test(details.course_taken.trim())) {
                firstErrorField = 'course';
            }
        }

        if (!firstErrorField && details.positive === undefined) {
            firstErrorField = 'positive';
        }

        if (firstErrorField) {
            setActiveError(firstErrorField);

            const element = document.getElementById(`field-${firstErrorField}`);
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });

            return;
        }

        setSubmitProgressLabel("Posting review...");
        setSubmitting(true);

        // @ts-expect-error Clarity is not defined
        clarity("set", "ReviewSubmitted", "true");
        window.scrollTo(0, 0);
        const fingerprintPromise = collectReviewClientFingerprint();

        let finalAttachmentId = details.attachment?.id;

        if (details.attachment) {
            const uploadedId = await ensureAttachmentUploaded();

            if (!uploadedId) {
                showAttachmentUploadError();
                setSubmitProgressLabel("Posting review...");
                setSubmitting(false);
                return;
            }

            finalAttachmentId = uploadedId;
            setSubmitProgressLabel("Posting review...");
        }

        const token = await getRecaptchaToken(executeRecaptcha, "new_review");

        if (!token) {
            // @ts-expect-error Clarity is not defined
            clarity("set", "ReviewFailed", "true");
            setSubmitting("error");
            return;
        }

        const clientFingerprint = await fingerprintPromise.catch(() => undefined);

        const result = await postReview({
            text: details.comment!,
            score: details.score!,
            positive: details.positive!,
            professor_email: props.professorEmail,
            recaptcha_token: token,
            client_fingerprint: clientFingerprint,
            attachment: finalAttachmentId,
            gif: details.gif ? details.gif.url : undefined,
            course_taken: details.course_taken,
            grade_received: details.grade_received,
        });

        if (!result) {
            // @ts-expect-error Clarity is not defined
            clarity("set", "ReviewFailed", "true");
            setSubmitting("error");
            return;
        }

        const review = result.review;
        reviewRef.current = review;

        if (review.flagged) {
            setSubmitProgressLabel("Posting review...");
            modal.openModal(FlaggedModal, {
                warning: review.warning,
                finalizeSubmission: finalizeSubmission,
                editReview: editReview,
            });
            return;
        }

        finalizeSubmission();
    }

    async function handleSubmit() {
        await submitReview();
    }

    if (submitting === null) {
        return <ReviewSubmittedNotice justSubmitted={Boolean(reviewRef.current)}/>;
    }

    if (submitting === "error") {
        return (
            <section className={styles.form}>
                <span>There was an error submitting your review. Please try again later.</span>
            </section>
        );
    }

    let lengthStyle = styles.commentLength;
    if (details.comment && details.comment.length > 350) {
        lengthStyle += ` ${styles.commentLengthWarning}`;
    } else if (details.comment && details.comment.length == 350) {
        lengthStyle += ` ${styles.commentLengthPerfect}`;
    } else if (details.comment && details.comment.length < 350) {
        lengthStyle += ` ${styles.commentLengthGood}`;
    }

    const commentErrorId = activeError === "comment" ? "review-comment-error" : undefined;
    const scoreErrorId = activeError === "score" ? "review-score-error" : undefined;
    const positiveErrorId = activeError === "positive" ? "review-positive-error" : undefined;

    return (
        <>
            <ReviewSubmitProgress active={submitting === true} label={submitProgressLabel}/>

            <section
                className={styles.reviewForm}
                aria-busy={submitting}
                onClick={event => {
                    event.preventDefault();
                }}
            >
                {/*{!submitting && props.professorEmail.endsWith('@uaeu.ac.ae') && <>
                    {
                        mode === "GUEST" ?  <div className={styles.privacyNotice} onClick={(e) => {
                            e.stopPropagation();
                            modal.openModal(StudentVerifyModal, {
                                mode,
                                setMode
                            })
                        }}><svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24">
                            <path fill="currentColor"
                                  d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8"/>
                        </svg>
                            <span>Your student status isn't verified. <u>Click here to verify.</u></span>
                        </div> : <div className={styles.verifiedBadge}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-8.29 13.29a.996.996 0 0 1-1.41 0L5.71 12.7a.996.996 0 1 1 1.41-1.41L10 14.17l6.88-6.88a.996.996 0 1 1 1.41 1.41z"/></svg>
                            <span>Your student status is verified.</span>
                        </div>
                    }
                </>}*/}

                <LexicalComposer
                    initialConfig={{
                        namespace: "lexical",
                        theme: {
                            rtl: styles.postRTL,
                            ltr: styles.postLTR,
                            paragraph: styles.postParagraph,
                            link: styles.postLink,
                        },
                        editable: !submitting,
                        nodes: [EmojiNode],
                        onError: error => console.log(error),
                    }}
                >
                    <div id="field-comment" style={{ position: 'relative' }} onClick={() => commentRef.current?.focus()}>

                        {activeError === 'comment' && (
                            <div id={commentErrorId} className={styles.errorTooltip} role="alert">
                                Please write a review
                            </div>
                        )}

                        <div className={styles.postEditor}>
                            <CustomPlainTextPlugin
                                placeholder={<div className={styles.postPlaceholder}>What was your
                                    experience?</div>}
                                contentEditable={
                                    <div className={styles.postContentContainer}>
                                        <ContentEditable
                                            style={{outline: "none"}}
                                            role={"textbox"}
                                            aria-label="Review text"
                                            aria-invalid={activeError === 'comment' || undefined}
                                            aria-describedby={
                                                commentErrorId
                                                    ? `review-comment-length ${commentErrorId}`
                                                    : "review-comment-length"
                                            }
                                            spellCheck={"true"}
                                            className={styles.postContent}
                                        />
                                    </div>
                                }
                            />
                            <HistoryPlugin/>
                            <EditorRefPlugin editorRef={commentRef}/>
                            <OnChangePlugin
                                onChange={editorState => {
                                    let f = "";

                                    editorState.read(() => {
                                        f = $getRoot().getTextContent();
                                    });

                                    setDetails(prevDetails => ({
                                        ...prevDetails,
                                        comment: f,
                                    }));

                                    if(f.trim().length > 0) clearError();
                                }}
                            />
                        </div>

                        <div id="review-comment-length" className={lengthStyle} aria-live="polite">
                            <div>
                                <span>
                                {[...(details.comment ?? "").trim()].length > 0
                                    ? [...details.comment].length
                                    : 0}
                                </span>
                                <span>/350</span>
                            </div>
                        </div>
                    </div>

                    <ReviewAttachment details={details} setDetails={setDetails}/>
                    <EmojiSelector open={emojiOpen}/>
                </LexicalComposer>

                {!submitting && (
                    <ReviewFormFooter
                        details={details}
                        emojiOpen={emojiOpen}
                        setDetails={setDetails}
                        setEmojiOpen={setEmojiOpen}
                    />
                )}

                {!submitting &&
                    <AccessibleRating
                        value={details.score}
                        invalid={activeError === 'score'}
                        errorId={scoreErrorId}
                        onChange={(score) => {
                            setDetails(prev => ({...prev, score}));
                            clearError();
                        }}
                    />
                }

                {props.professorEmail.endsWith('@uaeu.ac.ae') && !submitting && <div className={styles.courseDetails}>
                    <div ref={comboboxRef} className={styles.comboboxWrapper} id="field-course" style={{ position: 'relative' }}>

                        {activeError === 'course' && (
                            <div className={styles.errorTooltip}>
                                Must be 4 letters & 3 numbers (e.g. MATH110)
                            </div>
                        )}

                        <label className={styles.inputTitle}>Course taken</label>
                        <input
                            type="text"
                            className={styles.comboboxInput}
                            placeholder="e.g. MATH110"
                            value={details.course_taken}
                            onChange={(e) => {
                                setDetails(prev => ({...prev, course_taken: e.target.value.toUpperCase()}));
                                setShowCourseMenu(true);
                                ensureCourseCatalogLoaded();
                                clearError();
                            }}
                            onFocus={() => {
                                setShowCourseMenu(true);
                                ensureCourseCatalogLoaded();
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                                setShowCourseMenu(true);
                                ensureCourseCatalogLoaded();
                            }}
                        />

                        {showCourseMenu && (
                            <div className={styles.comboboxMenu}>
                                {courseSuggestions.length > 0 ? (
                                    courseSuggestions.map((course) => (
                                        <div
                                            key={course.tag}
                                            className={styles.comboboxItem}
                                            onClick={() => {
                                                setDetails(prev => ({...prev, course_taken: course.tag}));
                                                setShowCourseMenu(false);
                                            }}
                                        >
                                            <span className={styles.comboboxCourseTag}>{course.tag}</span>
                                            {course.name && (
                                                <span className={styles.comboboxCourseName}>{course.name}</span>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.noResults}>
                                        {courseCatalogLoading ? "Loading courses..." : "No matches."}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={styles.inputField}>
                        <label className={styles.inputTitle} htmlFor="review-grade-select">Grade received (optional)</label>
                        <div className={styles.selectContainer}>
                            <select id="review-grade-select" className={styles.nativeSelect} value={details.grade_received}
                                    onChange={(e) => {
                                        setDetails(prev => ({...prev, grade_received: e.target.value}));
                                    }}>
                                <option value=""></option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="F">F</option>
                            </select>
                        </div>
                    </div>
                </div>}

                {!submitting && <div className={styles.inputField} id="field-positive" style={{position: 'relative'}}>

                    {activeError === 'positive' && (
                        <div id={positiveErrorId} className={styles.errorTooltip} role="alert">
                            Please select an option
                        </div>
                    )}

                    <label className={styles.inputTitle}>Would you recommend?</label>

                    <div className={styles.recommendGroup}>
                        <button
                            type="button"
                            aria-pressed={details.positive === true}
                            onClick={() => {
                                setDetails(prev => ({...prev, positive: true}));
                                clearError();
                            }}
                            className={details.positive === true ? styles.btnYesActive : styles.recommendBtn}
                        >
                            <span>👍</span> Yes
                        </button>

                        <button
                            type="button"
                            aria-pressed={details.positive === false}
                            onClick={() => {
                                setDetails(prev => ({...prev, positive: false}));
                                clearError();
                            }}
                            className={details.positive === false ? styles.btnNoActive : styles.recommendBtn}
                        >
                            <span>👎</span> No
                        </button>
                    </div>
                </div>}


                <div className={styles.submitButtonWrapper}>
                    <div
                        title={"Post"}
                        className={
                            submitting
                                ? styles.veryDisabledFormSubmit
                                // Change: We allow the button to be clicked even if invalid, so we can show tooltips
                                : styles.enabledFormSubmit
                        }
                        onClick={async event => {
                            event.stopPropagation();
                            if (submitting || !props.canReview) return;
                            await handleSubmit();
                        }}
                    >
                        <span>Post</span>
                    </div>
                </div>

                <div className={styles.disclaimer} onClick={e => e.stopPropagation()}>
                    This site is protected by reCAPTCHA and the Google{" "}
                    <a href="https://policies.google.com/privacy" target={"_blank"}>
                        Privacy Policy
                    </a>{" "}
                    and{" "}
                    <a href="https://policies.google.com/terms" target={"_blank"}>
                        Terms of Service
                    </a>{" "}
                    apply.
                </div>
            </section>
        </>
    );
}
