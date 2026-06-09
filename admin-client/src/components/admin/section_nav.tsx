import {NavLink} from "react-router-dom";
import type {LucideIcon} from "lucide-react";
import {cn} from "@/lib/utils";
import styles from "./section_nav.module.scss";

export interface NavSection {
    label: string;
    items: {
        to: string;
        label: string;
        icon: LucideIcon;
    }[];
}

interface SectionNavProps {
    sections: NavSection[];
    onNavigate?: () => void;
}

export function SectionNav({sections, onNavigate}: SectionNavProps) {
    return (
        <nav className={styles.nav}>
            {sections.map(section => (
                <section key={section.label}>
                    <p className={styles.sectionLabel}>{section.label}</p>
                    <div className={styles.items}>
                        {section.items.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end
                                onClick={onNavigate}
                                className={({isActive}) => cn(styles.link, isActive && styles.active)}
                            >
                                <item.icon/>
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </section>
            ))}
        </nav>
    );
}
