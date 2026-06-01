import {Navigate, createBrowserRouter} from "react-router-dom";
import {AdminLayout} from "@/layouts/admin_layout";
import {ModerationPage} from "@/pages/moderation";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AdminLayout/>,
        children: [
            {index: true, element: <Navigate to="/reviews" replace/>},
            {path: "reviews", element: <ModerationPage/>},
            {path: "moderation", element: <Navigate to="/reviews" replace/>},
            {path: "policy", element: <Navigate to="/reviews" replace/>},
            {path: "*", element: <Navigate to="/reviews" replace/>},
        ],
    },
]);
