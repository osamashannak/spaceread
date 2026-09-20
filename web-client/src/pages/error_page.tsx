import {useRouteError} from "react-router-dom";
import styles from "../styles/pages/error.module.scss";
import * as Sentry from "@sentry/react";
import PageMetadata from "../components/page_metadata.tsx";

export function ErrorPage() {

    const error = useRouteError();

    if (error) {
        Sentry.captureException(error);
    }

    return (
        <div className={styles.errorPage}>
            <PageMetadata
                title="Page Unavailable · SpaceRead"
                description="This page is temporarily unavailable. Please try again later."
            />
            <div className={styles.textBlock}>
                <span className={styles.errorText}>Oops! Something went wrong 😅</span>
                <p className={styles.errorSubText}>Try refreshing the page or come back later.</p>
            </div>
        </div>
    );
}
