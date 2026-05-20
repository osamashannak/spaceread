import styles from "../styles/components/global/footer.module.scss";
import {Link} from "react-router-dom";


export default function Footer() {

    return (
        <footer>
            {/*<section className={styles.footerBlock}>
                <h2 className={styles.blockTitle}>Join the UAEU Community</h2>
                <Link to={"/login"} className={styles.loginButton}>Go to Login</Link>
            </section>*/}
            <section className={styles.footerBlock}>
                <h2 className={styles.blockTitle}>Follow us on Instagram</h2>
                <a href={"https://instagram.com/uaeu.space"} className={styles.followButton} target={"_blank"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18.5px" height="18.5px" viewBox="0 0 24 24">
                        <path fill="currentColor"
                              d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3"/>
                    </svg>
                    <span>
                        UAEU.SPACE
                    </span>
                    </a>
            </section>
            <section className={styles.footerBlock}>
                <h2 className={styles.blockTitle}>About SpaceRead</h2>
                <div className={styles.blockBody}>
                    <ul className={styles.blockList}>
                        <li><span>SpaceRead is a multi-purpose platform for university students to prepare them during their studies.</span>
                        </li>
                        <li><span>The source code is available on <a target="_blank"
                                                                                  href="https://github.com/Am4nso/uaeu-space">GitHub</a>.</span>
                        </li>
                    </ul>
                </div>
            </section>
            <section className={styles.footerEnd}>
                <p className={styles.copyright}>© 2026 SpaceRead. Not affiliated with any university (Student-operated). Emojis by <a href={"https://github.com/jdecked/twemoji"}
                                                                rel="noreferrer" target={"_blank"}>Twemoji</a>.</p>
                <ul className={styles.links}>
                    <li><Link to={"/terms-of-service"}>Terms of Service</Link></li>
                    <li><Link to={"/privacy"}>Privacy Policy</Link></li>
                    <li><a href={"https://api.uaeu.space/sitemap.xml"}>Site Map</a></li>
                </ul>
            </section>
        </footer>
    );
}
