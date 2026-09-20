import SearchBox from "../components/searchbox.tsx";
import styles from "../styles/pages/course.module.scss";
import PageMetadata from "../components/page_metadata.tsx";

export default function CourseLookup() {
    return (
        <>
            <PageMetadata
                title="UAEU Course Materials · SpaceRead"
                description="Share and find notes, slides, videos, and files for courses at United Arab Emirates University (UAEU)."
                canonicalPath="/course"
            />
            <div className={styles.searchPage}>
                <section className={styles.lookupHero}>
                    <div className={styles.heroCopy}>
                        <span className={styles.heroEyebrow}>Course materials</span>
                        <h1>Course Materials</h1>
                        <p>Share and find notes, slides, videos, and files for UAEU courses.</p>
                    </div>
                </section>

                <section className={styles.lookupPanel}>
                    <div className={styles.searchBox}>
                        <SearchBox
                            type={"course"}
                            placeholder={"Search by course code or name"}
                        />
                    </div>
                </section>
            </div>
        </>
    )
}
