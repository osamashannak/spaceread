import einstein from "../assets/images/einstien.png";
import {lazy, Suspense, useEffect, useRef} from "react";
import styles from "../styles/pages/professor.module.scss";
import {getProfessor} from "../api/professor.ts";
import {useLocation, useParams} from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import 'react-loading-skeleton/dist/skeleton.css'
import {useDispatch, useSelector} from "react-redux";
import {clearProfessor, selectProfessor, setProfessor} from "../redux/slice/professor_slice.ts";
import {ProfessorAPI, ProfessorHistory} from "../typed/professor.ts";
import LoadingSuspense from "../components/loading_suspense.tsx";
import ReviewSkeleton from "../components/skeletons/review.tsx";
import DisabledReviewForm from "../components/professor/disabled_review_form.tsx";
import BackArrow from "../components/backarrow.tsx";
import {Helmet} from "@dr.pogodin/react-helmet";

const ReviewForm = lazy(async () => {
    const [moduleExports] = await Promise.all([
        await import("../components/professor/review_form.tsx"),
        new Promise(resolve => setTimeout(resolve, 500))
    ]);
    return moduleExports;
});

const ReviewSection = lazy(async () => {
    const [moduleExports] = await Promise.all([
        await import("../components/professor/review_section.tsx"),
        new Promise(resolve => setTimeout(resolve, 500))
    ]);
    return moduleExports;
});

function reviewIdFromHash(hash: string) {
    let value = hash.replace(/^#/, "").trim();

    try {
        value = decodeURIComponent(value);
    } catch {
        return "";
    }

    return /^\d+$/.test(value) ? value : "";
}

export default function Professor() {
    const {email} = useParams();
    const location = useLocation();

    const dispatch = useDispatch();
    const professorState = useSelector(selectProfessor);
    const latestReq = useRef<symbol | null>(null);
    const lastScrolledReviewTarget = useRef("");

    const professor = professorState.professor as ProfessorAPI | undefined | null;
    const focusedReviewId = reviewIdFromHash(location.hash);
    const professorEmail = professor?.email ?? "";

    // useFeedbackPopup(!!professor);

    useEffect(() => {
        if (!email) {
            dispatch(setProfessor(null));
            return;
        }

        const ac = new AbortController();
        dispatch(clearProfessor());

        const reqToken = Symbol("professor");
        latestReq.current = reqToken;

        (async () => {
            try {
                const data = await getProfessor(email.toLowerCase(), ac);
                if (ac.signal.aborted || latestReq.current !== reqToken) return;
                dispatch(setProfessor(data));
            } catch (err: any) {
                if (err?.name === "AbortError" || ac.signal.aborted || latestReq.current !== reqToken) return;
                dispatch(setProfessor(null));
            }
        })();

        return () => {
            ac.abort();
        }
    }, [dispatch, email]);


    useEffect(() => {
        if (professor) {

            const professorHistory = JSON.parse(localStorage.getItem("professorHistory") || "[]") as ProfessorHistory[];

            const professorIndex = professorHistory.findIndex((prof) => prof.email === professor.email);

            if (professorIndex !== -1) {
                professorHistory.splice(professorIndex, 1);
            }

            professorHistory.unshift({
                name: professor.name,
                email: professor.email,
                university: professor.university,
                date: new Date()
            });

            if (professorHistory.length > 10) {
                professorHistory.pop();
            }

            localStorage.setItem("professorHistory", JSON.stringify(professorHistory));
        }
    }, [professor]);

    useEffect(() => {
        if (!professorEmail || !focusedReviewId) return;

        const scrollTarget = `${professorEmail}:${focusedReviewId}`;
        if (lastScrolledReviewTarget.current === scrollTarget) return;

        let attempts = 0;
        let timeout: number | undefined;

        const scrollToReview = () => {
            const element = document.getElementById(`review-${focusedReviewId}`);
            if (element) {
                element.scrollIntoView({behavior: "smooth", block: "center"});
                lastScrolledReviewTarget.current = scrollTarget;
                return;
            }

            attempts++;
            if (attempts < 12) {
                timeout = window.setTimeout(scrollToReview, 100);
            }
        }

        scrollToReview();

        return () => {
            if (timeout) window.clearTimeout(timeout);
        }
    }, [focusedReviewId, professorEmail]);

    const isStale = email && professor && professor.email.toLowerCase() !== email.toLowerCase();

    if (professor === undefined || isStale) {
        return (

            <div className={styles.profPage}>

                <section className={styles.profInfoHead} style={{borderBottom: "none"}}>
                    <div className={styles.profIdentity}>
                        <p className={styles.universityName} style={{width: "210px"}}><Skeleton/></p>
                        <h1 style={{width: "150px"}}><Skeleton/></h1>
                        <p className={styles.collegeName} style={{width: "130px"}}><Skeleton/></p>
                    </div>

                    <div className={styles.profMetrics} aria-hidden="true">
                        <div className={styles.ratingMetric}>
                            <span className={styles.metricSkeleton} style={{width: "72px"}}><Skeleton/></span>
                        </div>
                        <span className={styles.metricDivider}/>
                        <div className={styles.recommendationMetric}>
                            <span className={styles.metricSkeleton} style={{width: "150px"}}><Skeleton/></span>
                        </div>
                    </div>
                </section>

                <div className={styles.commentsSection}>


                    <ReviewSkeleton/>
                    <ReviewSkeleton/>
                    <ReviewSkeleton/>
                    <ReviewSkeleton/>

                </div>

            </div>
        );
    }

    if (professor === null) {
        if (typeof window !== "undefined" && (window as any).clarity) {
            (window as any).clarity("set", "NoProfessor", "true");
        }

        return (

            <div className={styles.professorNotFound}>
                <div>
                    <span>Professor not found</span>
                </div>
                <img src={einstein} alt={""}/>
            </div>
        );
    }

    const score = parseFloat(professor.score.toFixed(1));
    const recommendationCount = professor.reviews.length;
    const recommendCount = professor.reviews.reduce((count, review) => count + (review.positive ? 1 : 0), 0);
    const recommendPercentage = recommendationCount > 0
        ? Math.round((recommendCount / recommendationCount) * 100)
        : 0;
    const recommendationDescription = recommendationCount > 0
        ? `${recommendPercentage}% recommend, based on ${recommendationCount} ${recommendationCount === 1 ? "review" : "reviews"}.`
        : "No recommendations yet.";
    const longestReview = professor.reviews.length > 0 ? professor.reviews.reduce((prev, current) => (prev.text.length > current.text.length) ? prev : current).text : undefined;

    return (
        <>
            <Helmet>
                <title>{professor.name} - {professor.university} - SpaceRead</title>
                <meta name={"description"}
                      content={longestReview ?? `Rate ${professor.name} from ${professor.university}!`}/>
            </Helmet>
            <div className={styles.profPage}>
                <BackArrow text={"Professor"} />

                <section className={styles.profInfoHead}>
                    <div className={styles.profIdentity}>
                        <p className={styles.universityName}>{professor.university}</p>
                        <h1>{professor.name}</h1>
                        <p className={styles.collegeName}>{professor.college}</p>
                    </div>

                    <div className={styles.profMetrics}>
                        <div
                            className={styles.ratingMetric}
                            role="img"
                            aria-label={score > 0 ? `${score} out of 5 overall rating.` : "No overall rating yet."}
                        >
                            <div className={styles.ratingValue} aria-hidden="true">
                                <span className={styles.score}>{score > 0 ? score : "N/A"}</span>
                                {score > 0 && <span className={styles.outOf}>/5</span>}
                            </div>
                            <span className={styles.metricCaption} aria-hidden="true">overall rating</span>
                        </div>

                        <span className={styles.metricDivider} aria-hidden="true"/>

                        <div
                            className={styles.recommendationMetric}
                            role="img"
                            aria-label={recommendationDescription}
                            title={recommendationDescription}
                        >
                            {recommendationCount > 0 ? <>
                                <div className={styles.recommendationHeading} aria-hidden="true">
                                    <span className={styles.recommendationValue}>{recommendPercentage}%</span>
                                    <span className={styles.recommendationLabel}>recommend</span>
                                </div>
                                <div className={styles.recommendationBar} aria-hidden="true">
                                    <span
                                        className={styles.recommendSegment}
                                        style={{width: `${recommendPercentage}%`}}
                                    />
                                </div>
                                <span className={styles.metricCaption} aria-hidden="true">
                                    {recommendationCount} {recommendationCount === 1 ? "review" : "reviews"}
                                </span>
                            </> :
                                <span className={styles.noRecommendations} aria-hidden="true">
                                    No recommendations yet
                                </span>}
                        </div>
                    </div>

                </section>

                <Suspense fallback={<DisabledReviewForm/>}>
                    <ReviewForm courses={professor.courses} professorEmail={professor.email} canReview={!professor.reviewed}/>
                </Suspense>

                <Suspense fallback={<LoadingSuspense height={"400px"}/>}>
                    <ReviewSection
                        professorReviews={professor.reviews}
                        focusedReviewId={focusedReviewId}
                        relatedReviews={professor.similar_professors}
                    />
                </Suspense>

            </div>
        </>
    );
}
