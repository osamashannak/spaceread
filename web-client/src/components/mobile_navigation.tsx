import styles from "../styles/components/global/mobile_navigation.module.scss";
import {Link, useNavigate} from "react-router-dom";
import {useEffect, useRef, useState} from "react";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {setUnreadCount} from "../redux/slice/notification_slice.ts";
import {logout as sendLogoutRequest} from "../api/auth.ts";
import {clearUser} from "../redux/slice/user_slice.ts";


export default function MobileNavigation() {

    const scrollRef = useRef<number>(window.scrollY);
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const [scrolling, setScrolling] = useState(false);
    const [selected, setSelected] = useState<string>((window.location.pathname || "").toString().split('/')[1] || "");
    const username = useAppSelector(state => state.user.username);
    const isAuthenticated = useAppSelector(state => state.user.status === "authenticated");
    const unreadCount = useAppSelector(state => state.notifications.unreadCount);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        setSelected((window.location.pathname || "").toString().split('/')[1] || "");
    }, [window.location.pathname]);

    async function handleLogout() {
        if (loggingOut) return;

        setLoggingOut(true);
        const response = await sendLogoutRequest();

        if (response?.ok || response?.status === 401) {
            dispatch(clearUser());
            dispatch(setUnreadCount(0));
            return;
        }

        setLoggingOut(false);
    }

    const headerClass = scrolling ? styles.navUp : '';
    const menuBlur = scrolling ? styles.menuBlur : '';

    useEffect(() => {
        let scrollCounter = 0;
        const updateInterval = 6;

        window.onscroll = () => {
            if (window.innerWidth > 768) return;

            if (window.scrollY > scrollRef.current && window.scrollY > 100) {
                setScrolling(true);
                scrollRef.current = window.scrollY;
                return;
            } else if (window.scrollY < 100) {
                setScrolling(false);
                scrollRef.current = window.scrollY;
                return;
            }

            scrollCounter++;

            if (scrollCounter % updateInterval === 0) {
                const scrollDifference = Math.abs(window.scrollY - scrollRef.current);

                if (window.scrollY < scrollRef.current && scrollDifference > 50) {
                    setScrolling(false);
                }

                scrollRef.current = window.scrollY;

                scrollCounter = 0;
            }
        };

        return () => {
            window.onscroll = null;
        }
    }, []);

    return (
        <>
            <header>
                <div className={styles.header}>
                    <div className={`${styles.header2} ${headerClass}`}>
                        <h1 className={styles.title} onClick={() => navigate("/")}>
                            <svg width="25" height="25" viewBox="0 0 192 192" fill="none"
                                 xmlns="http://www.w3.org/2000/svg">
                                <circle cx="96" cy="96" r="96" fill="#0599E5"/>
                                <path
                                    d="M89.1191 141.493C79.9991 136.213 52.1591 119.701 50.7191 117.973C49.3751 116.533 48.6071 114.613 48.6071 109.813C48.6071 106.447 48.6071 105.013 48.6071 102.613C48.9911 102.613 55.5191 105.493 62.7191 108.373C69.3541 111.027 81.4391 116.053 81.4391 116.053C81.4391 116.053 72.3191 111.658 54.0791 100.213C29.5991 84.8526 25.2791 83.3816 29.5991 81.0126C44.4791 72.8526 42.5591 74.6271 60.3191 65.6526C91.9991 49.6442 93.7271 48.2766 95.8391 48.8526C95.8391 48.8526 95.8391 48.8526 162.559 81.4926C164.383 82.385 164.453 83.9054 163.519 84.3726C160.639 85.8126 163.519 84.3726 135.199 100.693C107.381 116.724 107.839 117.493 107.839 117.493C107.839 117.493 107.839 117.493 124.428 110.101C142.111 102.613 142.111 102.613 142.111 102.613C142.111 102.613 142.111 104.533 142.111 109.813C142.111 118.098 139.039 119.413 139.039 119.413C139.039 119.413 111.116 138.96 99.1991 142.933C97.7591 143.413 93.2646 143.893 89.1191 141.493Z"
                                    fill="white"/>
                                <path
                                    d="M146.239 117.973V101.077L153.919 97.8127C153.919 97.8127 153.919 106.069 153.919 116.053C153.919 126.133 153.919 133.333 153.919 134.293L150.079 131.893L146.239 134.293C146.239 134.293 146.239 134.293 146.239 117.973Z"
                                    fill="white"/>
                            </svg>
                            <span className={styles.titleText}>SpaceRead</span>
                        </h1>
                        {isAuthenticated && username && (
                            <div className={styles.accountStatus} title={`Logged in as ${username}`}>
                                <span>Logged in as</span>
                                <strong>{username}</strong>
                                <span className={styles.accountSeparator}>·</span>
                                <button type="button" onClick={handleLogout} disabled={loggingOut}>
                                    {loggingOut ? "Logging out" : "Log out"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <div className={`${styles.mobileNav} ${menuBlur}`}>
                <Link className={styles.navLinkMobile} to={"/professor"}>

                    {selected === "professor" ?
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                            <path fill="currentColor"
                                  d="M6.385 13.615h2.21l5.263-5.269q.129-.148.193-.31q.064-.163.064-.323t-.064-.316q-.064-.157-.188-.305l-.925-.95q-.128-.129-.298-.193q-.169-.064-.334-.064q-.16 0-.32.054q-.16.055-.307.203l-5.294 5.264zM12.3 8.688l-.95-.944l.956-.956l.925.95zm-.485 4.927h5.8v-1h-4.8zM3 20.077V4.615q0-.69.463-1.152Q3.925 3 4.615 3h14.77q.69 0 1.152.463q.463.462.463 1.152v10.77q0 .69-.462 1.153q-.463.462-1.153.462H6.077z"/>
                        </svg>
                        :
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                            <path fill="currentColor"
                                  d="M6.385 13.615h2.203l5.27-5.269q.129-.148.193-.31q.064-.163.064-.323t-.067-.316q-.067-.157-.19-.305l-.92-.95q-.128-.129-.298-.193q-.169-.064-.334-.064q-.16 0-.322.064q-.163.064-.31.193l-5.29 5.27zm6.846-5.902l-.925-.944zm-5.962 5.018v-.95l3.448-3.448l.462.488l.47.48l-3.43 3.43zm3.91-3.91l.47.48l-.932-.968zm.63 4.794h5.806v-1H12.81zM3 20.077V4.615q0-.69.463-1.152Q3.925 3 4.615 3h14.77q.69 0 1.152.463q.463.462.463 1.152v10.77q0 .69-.462 1.153q-.463.462-1.153.462H6.077zM5.65 16h13.735q.23 0 .423-.192q.192-.193.192-.423V4.615q0-.23-.192-.423Q19.615 4 19.385 4H4.615q-.23 0-.423.192Q4 4.385 4 4.615v13.03zM4 16V4z"/>
                        </svg>
                    }
                    <div className={styles.mobileText}>
                        <span>Rate Professor</span>
                    </div>

                </Link>

                <Link className={styles.navLinkMobile} to={"/course"}>

                    {selected === "course" ?
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
                             viewBox="0 0 256 256">
                            <path fill="currentColor"
                                  d="M216 32v160a8 8 0 0 1-8 8H72a16 16 0 0 0-16 16h136a8 8 0 0 1 0 16H48a8 8 0 0 1-8-8V56a32 32 0 0 1 32-32h136a8 8 0 0 1 8 8Z"/>
                        </svg> :
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
                             viewBox="0 0 256 256">
                            <path fill="currentColor"
                                  d="M208 26H72a30 30 0 0 0-30 30v168a6 6 0 0 0 6 6h144a6 6 0 0 0 0-12H54v-2a18 18 0 0 1 18-18h136a6 6 0 0 0 6-6V32a6 6 0 0 0-6-6Zm-6 160H72a29.87 29.87 0 0 0-18 6V56a18 18 0 0 1 18-18h130Z"/>
                        </svg>

                    }
                    <div className={styles.mobileText}>
                        <span>Course Materials</span>
                    </div>
                </Link>

                <Link className={styles.navLinkMobile} to={"/notifications"}>
                    <span className={styles.notificationIcon}>
                        {selected === "notifications" ?
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
                                 viewBox="0 0 512 512">
                                <path fill="currentColor"
                                      d="M440.08 341.31c-1.66-2-3.29-4-4.89-5.93c-22-26.61-35.31-42.67-35.31-118c0-39-9.33-71-27.72-95c-13.56-17.73-31.89-31.18-56.05-41.12a3 3 0 0 1-.82-.67C306.6 51.49 282.82 32 256 32s-50.59 19.49-59.28 48.56a3.1 3.1 0 0 1-.81.65c-56.38 23.21-83.78 67.74-83.78 136.14c0 75.36-13.29 91.42-35.31 118c-1.6 1.93-3.23 3.89-4.89 5.93a35.16 35.16 0 0 0-4.65 37.62c6.17 13 19.32 21.07 34.33 21.07H410.5c14.94 0 28-8.06 34.19-21a35.17 35.17 0 0 0-4.61-37.66M256 480a80.06 80.06 0 0 0 70.44-42.13a4 4 0 0 0-3.54-5.87H189.12a4 4 0 0 0-3.55 5.87A80.06 80.06 0 0 0 256 480"/>
                            </svg>
                            :
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
                                 viewBox="0 0 512 512">
                                <path fill="none" stroke="currentColor" strokeLinecap="round"
                                      strokeLinejoin="round" strokeWidth="24"
                                      d="M427.68 351.43C402 320 383.87 304 383.87 217.35C383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53c-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43C73.68 364.45 83 384 101.61 384h308.88c18.51 0 27.77-19.61 17.19-32.57M320 384v16a64 64 0 0 1-128 0v-16"/>
                            </svg>
                        }
                        {unreadCount > 0 && <span className={styles.notificationBadge}>
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>}
                    </span>
                    <div className={styles.mobileText}>
                        <span>Notifications</span>
                    </div>
                </Link>

                <a className={styles.navLinkMobile} href={"https://instagram.com/uaeu.space"} target={"_blank"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                        <g fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8"/>
                            <path d="M3 16V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m17.5 6.51l.01-.011"/>
                        </g>
                    </svg>
                    <div className={styles.mobileText}>
                        <span>Follow us</span>
                    </div>

                </a>

            </div>

        </>

    )
}
