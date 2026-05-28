import {createBrowserRouter, Navigate} from "react-router-dom";
import Professor from "../pages/professor.tsx";
import ProfessorLookup from "../pages/professor_lookup.tsx";
import Course from "../pages/course.tsx";
import CourseLookup from "../pages/course_lookup.tsx";
import TermsOfService from "../pages/legal/tos.tsx";
import Privacy from "../pages/legal/privacy.tsx";
import Login from "../pages/login.tsx";
import Layout from "../layouts/layout.tsx";
import Notifications from "../pages/notifications.tsx";
import ScheduleMaker from "../pages/schedule_maker.tsx";
import PageNotFound from "../pages/page_not_found.tsx";
import Feedback from "../pages/feedback.tsx";
import {ErrorPage} from "../pages/error_page.tsx";
import RestrictedProfessor from "../pages/restricted_professor.tsx";
import MySpace from "../pages/my_space.tsx";

const Router = createBrowserRouter([
    {
        element: <Layout/>,
        children: [
            {
                path: "/",
                element: <Navigate to={"/professor"} replace/>
            },
            {
                path: "notifications",
                element: <Notifications/>
            },
            {
                path: "my-space",
                element: <MySpace/>
            },
            {
                path: "terms-of-service",
                element: <TermsOfService/>
            },
            {
                path: "privacy",
                element: <Privacy/>
            },
            {
                path: "professor",
                element: <ProfessorLookup/>
            },
            {
                path: "professor/jawadh@uaeu.ac.ae",
                errorElement: <ErrorPage/>,
                element: <RestrictedProfessor/>,
            },
            {
                path: "professor/:email",
                errorElement: <ErrorPage/>,
                element: <Professor/>,
            },
            {
                path: "course",
                element: <CourseLookup/>
            },
            {
                path: "course/:tag",
                errorElement: <ErrorPage/>,
                element: <Course/>,
            },
            {
                path: "schedule",
                element: <ScheduleMaker/>
            },
            {
                path: "login",
                element: <Login/>
            },
            {
                path: "feedback",
                element: <Feedback/>
            },
            {
                path: "*",
                element: <PageNotFound/>
            }
        ]
    }
]);

export default Router;
