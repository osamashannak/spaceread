import {Search} from "lucide-react";
import styles from "./ops_header.module.scss";

interface OpsHeaderProps {
    title: string;
}

export function OpsHeader({title}: OpsHeaderProps) {
    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <div>
                    <p className={styles.eyebrow}>SpaceRead admin</p>
                    <h1 className={styles.title}>{title}</h1>
                </div>
                <div className={styles.right}>
                    <div className={styles.search}>
                        <Search size={16}/>
                        <span>Search target types, reason codes, action IDs</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
