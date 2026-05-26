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
import RelatedReviews from "../components/professor/related_reviews.tsx";
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

export default function Professor() {
    const {email} = useParams();
    const location = useLocation();

    const dispatch = useDispatch();
    const professorState = useSelector(selectProfessor);
    const latestReq = useRef<symbol | null>(null);

    const professor = professorState.professor as ProfessorAPI | undefined | null;

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
        if (!professor || !location.hash.startsWith("#review-")) return;

        let attempts = 0;
        let timeout: number | undefined;

        const scrollToReview = () => {
            const element = document.getElementById(location.hash.slice(1));
            if (element) {
                element.scrollIntoView({behavior: "smooth", block: "center"});
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
    }, [location.hash, professor]);

    const isStale = email && professor && professor.email.toLowerCase() !== email.toLowerCase();

    if (professor === undefined || isStale) {
        return (

            <div className={styles.profPage}>

                <section className={styles.profInfoHead} style={{borderBottom: "none"}}>
                    <div className={styles.profInfoLeft}>
                        <h1 style={{width: "100px"}}><Skeleton/></h1>
                        <p style={{width: "200px"}}><Skeleton/></p>
                    </div>

                    <div className={styles.profInfoRight}>
                        <p className={styles.score}><Skeleton/></p>
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

                    <div className={styles.infoLeft}>
                        {score > 0 ?
                            <div className={styles.infoLeftScore}>
                                <span className={styles.score}>{score}</span>
                                <span className={styles.outOf}>/5</span>
                            </div>
                            :
                            <span className={styles.score}>N/A</span>}
                    </div>

                    <div className={styles.infoRight}>
                        <p className={styles.universityName}>{professor.university}</p>
                        <h1>{professor.name}</h1>
                        <span className={styles.collegeName}>{professor.college}</span>
                    </div>

                </section>

                <Suspense fallback={<DisabledReviewForm/>}>
                    <ReviewForm courses={professor.courses} professorEmail={professor.email} canReview={!professor.reviewed}/>
                </Suspense>

                {professor.similar_professors.length > 0 && <RelatedReviews reviews={professor.similar_professors}/>}

                <Suspense fallback={<LoadingSuspense height={"400px"}/>}>
                    <ReviewSection professorReviews={professor.reviews}/>
                </Suspense>

            </div>
        </>
    );
}
