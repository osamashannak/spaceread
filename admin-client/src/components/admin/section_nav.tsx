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
        /** Items waiting in this page's default queue. */
        badge?: number;
    }[];
}

interface SectionNavProps {
    sections: NavSection[];
    onNavigate?: () => void;
}

const compactCount = new Intl.NumberFormat("en-US", {notation: "compact", maximumFractionDigits: 1});

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
                                {item.badge ? (
                                    <span className={styles.badge} aria-label={`${item.badge} waiting`}>
                                        {compactCount.format(item.badge)}
                                    </span>
                                ) : null}
                            </NavLink>
                        ))}
                    </div>
                </section>
            ))}
        </nav>
    );
}
