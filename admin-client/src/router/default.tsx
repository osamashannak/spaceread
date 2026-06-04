import {Navigate, createBrowserRouter} from "react-router-dom";
import {AdminLayout} from "@/layouts/admin_layout";
import {ModerationPage} from "@/pages/moderation";
import {ReasonsPage} from "@/pages/reasons";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AdminLayout/>,
        children: [
            {index: true, element: <Navigate to="/reviews" replace/>},
            {path: "reviews", element: <ModerationPage/>},
            {path: "reasons", element: <ReasonsPage/>},
            {path: "*", element: <Navigate to="/reviews" replace/>},
        ],
    },
]);
