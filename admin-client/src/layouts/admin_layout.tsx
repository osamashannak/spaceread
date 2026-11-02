import {useEffect, useMemo, useState} from "react";
import {Outlet, useLocation} from "react-router-dom";
import {
    BookOpen,
    ChartLine,
    FileText,
    GraduationCap,
    MessageSquareText,
    ShieldAlert,
    SlidersHorizontal,
    ThumbsUp,
    UserRoundPlus,
} from "lucide-react";
import {AdminAccessGate} from "@/layouts/admin_access_gate";
import {WorkspaceShell} from "@/components/admin/workspace_shell";
import type {NavSection} from "@/components/admin/section_nav";
import {AdminEntityDrawerProvider} from "@/components/admin/entity_drawer";
import {type AdminQueueCounts, getAdminQueueCounts} from "@/lib/admin_api";

const queueRefreshMs = 60_000;

function buildNavSections(counts: AdminQueueCounts | null): NavSection[] {
    return [
        {
            label: "Moderation",
            items: [
                {to: "/reviews", label: "Reviews", icon: MessageSquareText, badge: counts?.reviews},
                {to: "/reviews/suspicious", label: "Suspicious reviews", icon: ShieldAlert},
                {to: "/review-ratings/suspicious", label: "Suspicious ratings", icon: ThumbsUp},
                {to: "/course-files", label: "Course files", icon: FileText, badge: counts?.course_files},
                {to: "/reasons", label: "Reasons", icon: SlidersHorizontal},
            ],
        },
        {
            label: "Requests",
            items: [
                {to: "/professor-requests", label: "Professor add requests", icon: UserRoundPlus, badge: counts?.professor_requests},
            ],
        },
        {
            label: "Catalog",
            items: [
                {to: "/professors", label: "Professors", icon: GraduationCap},
                {to: "/courses", label: "Courses", icon: BookOpen},
            ],
        },
        {
            label: "Insights",
            items: [
                {to: "/statistics", label: "Statistics", icon: ChartLine},
            ],
        },
    ];
}

export function AdminLayout() {
    return (
        <AdminAccessGate>
            <AdminEntityDrawerProvider>
                <AdminWorkspace/>
            </AdminEntityDrawerProvider>
        </AdminAccessGate>
    );
}

function AdminWorkspace() {
    const location = useLocation();
    const counts = useQueueCounts(location.pathname);
    const sections = useMemo(() => buildNavSections(counts), [counts]);

    const title = useMemo(() => {
        const current = sections.flatMap(section => section.items).find(item => item.to === location.pathname);
        return current?.label || "Reviews";
    }, [sections, location.pathname]);

    return (
        <WorkspaceShell title={title} sections={sections}>
            <Outlet/>
        </WorkspaceShell>
    );
}

/** Queue sizes for the sidebar, refreshed on navigation and every minute. */
function useQueueCounts(pathname: string) {
    const [counts, setCounts] = useState<AdminQueueCounts | null>(null);

    useEffect(() => {
        let controller = new AbortController();
        const load = () => {
            controller.abort();
            controller = new AbortController();
            getAdminQueueCounts(controller.signal)
                .then(setCounts)
                .catch(() => {
                    // Badges are a convenience; keep the last known counts on failure.
                });
        };
        load();
        const timer = window.setInterval(load, queueRefreshMs);
        return () => {
            window.clearInterval(timer);
            controller.abort();
        };
    }, [pathname]);

    return counts;
}
