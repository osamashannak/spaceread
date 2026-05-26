import styles from "../styles/pages/feedback.module.scss";
import {useRef, useState} from "react";
import Line from "progressbar.js/line";
import ProgressBar from "progressbar.js";
import Radio from "../components/feedback/radio.tsx";
import Multi from "../components/feedback/multi.tsx";
import FreeResponse from "../components/feedback/free_response.tsx";
import {FeedbackResponse, NewFeedbackResponse} from "../typed/feedback.ts";
import LoadingSuspense from "../components/loading_suspense.tsx";
import {csrfHeader} from "../api/csrf.ts";


export default function Feedback() {

    const lineRef = useRef<Line | null>(null);
    const [feedbackId, setFeedbackId] = useState<string | null>(null);
    const [question, setQuestion] = useState<FeedbackResponse | null | "loading">(null);
    const [answer, setAnswer] = useState<string | null>(null);
    const [finished, setFinished] = useState(false);
    const [started, setStarted] = useState(false);
    const totalQuestions = useRef<number>(1000);
    const [submitting, setSubmitting] = useState(false);

    const HOST = import.meta.env.VITE_PROFESSOR_ENDPOINT;

    const handleAnswer = async () => {
        if (submitting) return; // ignore if already submitting
        // @ts-ignore
        if (!feedbackId || !question || (answer === null && question && "type" in question && question.type !== "text")) return;

        setSubmitting(true);

        try {
            const res = await fetch(HOST + "/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...csrfHeader()
                },
                body: JSON.stringify({id: feedbackId, answer}),
                credentials: "include"
            });

            const data: FeedbackResponse = await res.json();

            if (data.text === "Thank you for your feedback!") {
                setFinished(true);
                lineRef.current?.animate(1, {duration: 500, easing: "easeInOut"});
            } else {
                lineRef.current?.animate(
                    (totalQuestions.current - data.remaining_count! + 1) / totalQuestions.current,
                    {duration: 1000, easing: "easeOut"}
                );

                setQuestion({
                    text: data.text,
                    type: data.type,
                    options: data.options,
                });
                setAnswer(null);
            }
        } catch (err) {
            console.error("Failed to submit feedback", err);
        } finally {
            setSubmitting(false);
        }
    };

    const startFeedback = async () => {
        setStarted(true);
        setQuestion("loading");

        const res = await fetch(HOST + "/feedback/new", {
            credentials: "include"
        });
        const data: NewFeedbackResponse = await res.json();

        totalQuestions.current = data.remaining_count;
        setFeedbackId(data.feedback_id);
        setFinished(data.complete);
        if (data) {
            setQuestion(data.question || null);
        }

        lineRef.current = new ProgressBar.Line("#line-container", {
            color: "#00bfff",
            strokeWidth: 0.7,
            trailWidth: 1,
            from: {color: "#00bfff"},
            to: {color: "#87CEFA"},
        });

        lineRef.current?.animate(1 / totalQuestions.current, {duration: 2000, easing: "easeInOut"});
    };

    const renderQuestion = () => {

        if (question === "loading") {
            return <LoadingSuspense/>;
        }

        if (!question) return;

        const commonProps = {question, answer, onChange: setAnswer};

        if (question.type === "radio") {
            return <Radio key={question.text} {...commonProps} />;
        }
        if (question.type === "multi") {
            return <Multi key={question.text} {...commonProps} />;
        }
        if (question.type === "text") {
            return <FreeResponse key={question.text} {...commonProps} />;
        }
        return null;
    };

    if (!started) {
        return (
            <div className={styles.feedbackPage}>
                <div className={styles.head}>
                    <h2>📝 SpaceRead Feedback</h2>
                </div>
                <div className={styles.description}>
                    <span><i>We’re looking to make SpaceRead even better for everyone. Please take a minute to share your feedback about the website. Your responses are anonymous and really help us improve!</i></span>
                </div>

                <div className={styles.lineContainer}>
                    <div id={"line-container"}></div>
                </div>
                <div className={styles.buttons}>
                    <div className={styles.startButton} onClick={startFeedback}>
                        <span>Start</span>
                    </div>
                </div>
            </div>
        );
    }

    if (finished) {
        return (
            <div className={styles.feedbackPage}>
                <h2>✅ Thanks for your feedback!</h2>

                <div className={styles.nextButton}
                     style={{
                            marginTop: "32px",
                         width: "fit-content",
                     }}
                     onClick={() => {
                         window.location.href = "/";
                     }}>
                    <span>Home</span>
                </div>

            </div>
        );
    }

    return (
        <>
            <div className={styles.feedbackPage}>

                <div className={styles.head}>
                    <h2>📝 SpaceRead Feedback</h2>
                </div>

                <div className={styles.description}>
                    <span><i>We’re looking to make SpaceRead even better for everyone. Please take a minute to share your feedback about the website. Your responses are anonymous and really help us improve!</i></span>
                </div>

                <div className={styles.lineContainer}>
                    <div id={"line-container"}></div>
                </div>

                {renderQuestion()}

                <div className={styles.buttons}>
                    <div className={styles.nextButton}
                         style={{pointerEvents: submitting ? "none" : "auto", opacity: submitting ? 0.5 : 1}}
                         onClick={handleAnswer}>
                        <span>Next</span>
                    </div>
                </div>


            </div>
        </>
    )

}
