import {useMemo} from "react";
import {Outlet, useLocation} from "react-router-dom";
import {
    MessageSquareText,
} from "lucide-react";
import {AdminAccessGate} from "@/layouts/admin_access_gate";
import {WorkspaceShell} from "@/components/admin/workspace_shell";
import type {NavSection} from "@/components/admin/section_nav";

const navSections: NavSection[] = [
    {
        label: "Moderation",
        items: [
            {to: "/reviews", label: "Reviews", icon: MessageSquareText},
        ],
    },
];

const navItems = navSections.flatMap(section => section.items);

export function AdminLayout() {
    const location = useLocation();

    const title = useMemo(() => {
        const current = navItems.find(item => item.to === location.pathname);
        return current?.label || "Reviews";
    }, [location.pathname]);

    return (
        <AdminAccessGate>
            <WorkspaceShell
                title={title}
                sections={navSections}
            >
                <Outlet/>
            </WorkspaceShell>
        </AdminAccessGate>
    );
}
