import {Navigate, createBrowserRouter} from "react-router-dom";
import {AdminLayout} from "@/layouts/admin_layout";
import {ModerationPage} from "@/pages/moderation";
import {ReasonsPage} from "@/pages/reasons";
import {SuspiciousReviewsPage} from "@/pages/suspicious_reviews";
import {SuspiciousReviewRatingsPage} from "@/pages/suspicious_review_ratings";
import {CourseFilesPage} from "@/pages/course_files";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AdminLayout/>,
        children: [
            {index: true, element: <Navigate to="/reviews" replace/>},
            {path: "reviews", element: <ModerationPage/>},
            {path: "reviews/suspicious", element: <SuspiciousReviewsPage/>},
            {path: "review-ratings/suspicious", element: <SuspiciousReviewRatingsPage/>},
            {path: "course-files", element: <CourseFilesPage/>},
            {path: "reasons", element: <ReasonsPage/>},
            {path: "*", element: <Navigate to="/reviews" replace/>},
        ],
    },
]);
