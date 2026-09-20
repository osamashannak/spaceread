import {CourseAPI} from "../typed/course.ts";
import {lazy, useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {getCourse} from "../api/course.ts";
import Skeleton from "react-loading-skeleton";
import styles from "../styles/pages/course.module.scss";
import fileStyles from "../styles/components/course/file.module.scss";
import BackArrow from "../components/backarrow.tsx";
import PageMetadata from "../components/page_metadata.tsx";
import {encodePathSegment} from "../lib/metadata.ts";


const FileSkeleton = lazy(
    async () => await import("../components/skeletons/file.tsx")
);
const FileUpload = lazy(
    async () => await import("../components/course/file_upload.tsx")
);
const File = lazy(
    async () => await import("../components/course/file.tsx")
);


export default function Course() {
    const [result, setResult] = useState<{
        tag: string | undefined;
        course: CourseAPI | undefined | null;
    }>();
    const {tag} = useParams();
    const course = result && result.tag === tag ? result.course : undefined;

    useEffect(() => {
        let active = true;
        setResult({tag, course: undefined});

        if (!tag) {
            setResult({tag, course: null});
            return;
        }

        getCourse(tag.toLowerCase()).then((course) => {
            if (active) {
                setResult({tag, course});
            }
        });

        return () => {
            active = false;
        };
    }, [tag]);

    if (course === undefined) {
        return (
            <div className={styles.coursePage}>
                <PageMetadata
                    title="UAEU Course Materials · SpaceRead"
                    description="Find notes, slides, videos, and files for courses at United Arab Emirates University (UAEU)."
                />
                <section className={styles.courseInfoHead} style={{width: "100%", borderBottom: 0}}>
                    <h2 style={{width: "100px"}}><Skeleton/></h2>
                    <h1 style={{width: "200px"}}><Skeleton/></h1>
                </section>

                <section className={styles.fileList}>
                    <div className={styles.fileGrid}>
                        <FileSkeleton/>
                        <FileSkeleton/>
                        <FileSkeleton/>
                        <FileSkeleton/>
                    </div>
                </section>

            </div>
        )
    }

    if (course === null) {
        return (
            <div className={styles.coursePage}>
                <PageMetadata
                    title="Course Not Found · SpaceRead"
                    description="The requested UAEU course could not be found on SpaceRead."
                    noIndex
                />
                <section className={styles.courseInfoHead} style={{width: "100%", borderBottom: 0}}>
                    <h1>Course Not Found</h1>
                </section>

            </div>
        )
    }

    const fileCount = course.files.length;

    return (
        <>
            <PageMetadata
                title={`${course.tag}: ${course.name} · UAEU Course Materials · SpaceRead`}
                description={`Read and share notes, slides, videos, and files for ${course.tag}: ${course.name} at United Arab Emirates University (UAEU).`}
                canonicalPath={`/course/${encodePathSegment(course.tag)}`}
            />
            <div className={styles.coursePage}>
                <BackArrow text={"Course"}/>
                <section className={styles.courseInfoHead}>
                    <h2>{course.tag}</h2>
                    <h1>{course.name}</h1>
                </section>

                <section>
                    <FileUpload courseTag={course.tag}/>
                </section>

                <section className={styles.fileList}>
                    <div className={styles.fileListHeader}>
                        <h2>Files</h2>
                        <span>{fileCount} {fileCount === 1 ? "file" : "files"}</span>
                    </div>
                    {fileCount > 0 ? (
                        <div className={styles.fileGrid}>
                            {course.files.map((value, index) => (
                                <File key={index} {...value}/>
                            ))}
                        </div>
                    ) : <p className={fileStyles.emptyState}>{"No files yet."}</p>}
                </section>

            </div>
        </>
    );
}

