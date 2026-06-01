import {useState, type ReactNode} from "react";
import {Menu} from "lucide-react";
import {OpsHeader} from "@/components/admin/ops_header";
import {SectionNav, type NavSection} from "@/components/admin/section_nav";
import logo from "@/assets/logo.svg";
import styles from "./workspace_shell.module.scss";
import {cn} from "@/lib/utils";

interface WorkspaceShellProps {
    title: string;
    sections: NavSection[];
    children: ReactNode;
}

export function WorkspaceShell({title, sections, children}: WorkspaceShellProps) {
    const [open, setOpen] = useState(false);
    const sidebar = (
        <>
            <div className={styles.brand}>
                <img className={styles.logo} src={logo} alt="SpaceRead"/>
                <div className={styles.brandText}>
                    <p className={styles.brandName}>SpaceRead</p>
                    <p className={styles.brandLabel}>Admin</p>
                </div>
            </div>
            <div className={styles.navWrap}>
                <SectionNav sections={sections} onNavigate={() => setOpen(false)}/>
            </div>
        </>
    );

    return (
        <div className={styles.shell}>
            <aside className={cn(styles.sidebar, open && styles.sidebarOpen)}>
                {sidebar}
            </aside>
            <button className={cn(styles.backdrop, open && styles.backdropOpen)} aria-label="Close navigation" onClick={() => setOpen(false)}/>
            <div className={styles.content}>
                <div className={styles.mobileBar}>
                    <button className={styles.menuButton} type="button" aria-label="Open navigation" onClick={() => setOpen(true)}>
                        <Menu size={18}/>
                    </button>
                    <span className={styles.mobileTitle}>{title}</span>
                </div>
                <OpsHeader title={title}/>
                <main className={styles.main}>
                    {children}
                </main>
            </div>
        </div>
    );
}
