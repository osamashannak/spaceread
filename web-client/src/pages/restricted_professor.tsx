import einstein from "../assets/images/einstien.png";
import {lazy, Suspense, useEffect, useRef} from "react";
import styles from "../styles/pages/professor.module.scss";
import {getProfessor} from "../api/professor.ts";
import Skeleton from "react-loading-skeleton";
import 'react-loading-skeleton/dist/skeleton.css'
import {useDispatch, useSelector} from "react-redux";
import {clearProfessor, selectProfessor, setProfessor} from "../redux/slice/professor_slice.ts";
import {ProfessorAPI} from "../typed/professor.ts";
import LoadingSuspense from "../components/loading_suspense.tsx";
import ReviewSkeleton from "../components/skeletons/review.tsx";
import BackArrow from "../components/backarrow.tsx";
import PageMetadata from "../components/page_metadata.tsx";


const RestrictedReviewSection = lazy(async () => {
    const [moduleExports] = await Promise.all([
        await import("../components/professor/restricted_review_section.tsx"),
        new Promise(resolve => setTimeout(resolve, 500))
    ]);
    return moduleExports;
});

const RestrictedReviewForm = lazy(async () => {
    const [moduleExports] = await Promise.all([
        await import("../components/professor/restricted_review_form.tsx"),
        new Promise(resolve => setTimeout(resolve, 500))
    ]);
    return moduleExports;
});

export default function RestrictedProfessor() {
    const email = "jawadh@uaeu.ac.ae";

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
    }, [dispatch]);

    const isStale = professor && professor.email.toLowerCase() !== email.toLowerCase();

    if (professor === undefined || isStale) {
        return (

            <div className={styles.profPage}>
                <PageMetadata
                    title="Professor Profile · SpaceRead"
                    noIndex description={""}                />

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
                <PageMetadata
                    title="Professor Not Found · SpaceRead"
                    description="This professor profile is unavailable on SpaceRead."
                    noIndex
                />
                <div>
                    <span>Professor not found</span>
                </div>
                <img src={einstein} alt={""}/>
            </div>
        );
    }


    return (
        <>
            <PageMetadata
                title={`${professor.name} · ${professor.university} · SpaceRead`}
                description=""
                noIndex
            />
            <div className={styles.profPage}>
                <BackArrow text={"Professor"} />

                <section className={styles.profInfoHead}>


                    <div className={styles.infoRight}>
                        <p className={styles.universityName}>{professor.university}</p>
                        <h1>Dr. {professor.name}</h1>
                        <span className={styles.collegeName}>{professor.college}</span>

                    </div>

                </section>


                <Suspense fallback={<LoadingSuspense height={"400px"}/>}>
                    <RestrictedReviewForm professorEmail={professor.email} canReview={!professor.reviewed}/>
                </Suspense>

                <Suspense fallback={<LoadingSuspense height={"400px"}/>}>
                    <RestrictedReviewSection professorReviews={professor.reviews}/>
                </Suspense>

            </div>
        </>
    );
}
