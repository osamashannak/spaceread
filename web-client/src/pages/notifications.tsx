import styles from '../styles/pages/notifications.module.scss';
import {Helmet} from "@dr.pogodin/react-helmet";
import {Link} from "react-router-dom";
import {useEffect, useState} from "react";
import {NotificationAPI} from "../typed/notification.ts";
import {getNotifications, markAllNotificationsRead, markNotificationRead} from "../api/notifications.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {clearUnreadCount, setUnreadCount} from "../redux/slice/notification_slice.ts";
import {formatRelativeTime} from "../utils.tsx";

export default function Notifications() {
    const dispatch = useAppDispatch();
    const userStatus = useAppSelector(state => state.user.status);
    const [notifications, setNotifications] = useState<NotificationAPI[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (userStatus === "loading") return;

        let active = true;
        setLoading(true);
        setError(false);

        getNotifications().then((response) => {
            if (!active) return;

            if (!response) {
                setError(true);
                dispatch(setUnreadCount(0));
                setLoading(false);
                return;
            }

            setNotifications(response.notifications);
            dispatch(setUnreadCount(response.unread_count));
            setLoading(false);

            if (response.unread_count > 0) {
                markAllNotificationsRead().then((success) => {
                    if (!success || !active) return;
                    dispatch(clearUnreadCount());
                    setNotifications(current => current.map(notification => ({
                        ...notification,
                        read_at: notification.read_at ?? new Date()
                    })));
                });
            }
        });

        return () => {
            active = false;
        }
    }, [dispatch, userStatus]);

    const openNotification = (notification: NotificationAPI) => {
        markNotificationRead(notification.id).then();
        dispatch(clearUnreadCount());
    }

    return (
        <>
            <Helmet>
                <title>Notifications - SpaceRead</title>
            </Helmet>
            <div className={styles.notifPage}>

                <section className={styles.head}>
                    <div>
                        <h1>Notifications</h1>
                        {!loading && !error && notifications.length > 0 && (
                            <span>{notifications.length} recent</span>
                        )}
                    </div>
                </section>

                {loading && <div className={styles.status}>
                    <span className={styles.statusIcon}>
                        <BellIcon/>
                    </span>
                    <span>Loading notifications...</span>
                </div>}

                {!loading && error && <div className={styles.status}>
                    <span className={styles.statusIcon}>
                        <BellIcon/>
                    </span>
                    <span>Could not load notifications. Refresh the page and try again.</span>
                </div>}

                {!loading && !error && notifications.length === 0 && (
                    <div className={styles.status}>
                        <span className={styles.statusIcon}>
                            <BellIcon/>
                        </span>
                        <span>You have no notifications.</span>
                    </div>
                )}

                {!loading && !error && notifications.length > 0 && (
                    <div className={styles.notificationList}>
                        {notifications.map(notification => (
                            <Link
                                key={notification.id}
                                to={notification.href}
                                className={`${styles.notificationItem} ${notification.read_at ? "" : styles.unread}`}
                                onClick={() => openNotification(notification)}
                            >
                                <span className={styles.notificationGlyph}>
                                    <NotificationIcon type={notification.type}/>
                                </span>
                                <div className={styles.notificationContent}>
                                    <div className={styles.notificationTopLine}>
                                        <strong>{notification.title}</strong>
                                        <time>{formatRelativeTime(new Date(notification.created_at))}</time>
                                    </div>
                                    <span>{notification.body}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}

function NotificationIcon({type}: { type: NotificationAPI["type"] }) {
    if (type === "reply_mention") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path fill="currentColor"
                      d="M12 3a9 9 0 0 0 0 18h4.5a1 1 0 1 0 0-2H12a7 7 0 1 1 6.87-8.3c.08.43.13.87.13 1.3v1.5a1.5 1.5 0 0 1-3 0V8a1 1 0 0 0-2 0v.35A4.49 4.49 0 1 0 14.74 15A3.5 3.5 0 0 0 21 12v-1a8 8 0 0 0-.16-1.6A9 9 0 0 0 12 3Zm0 11a2.5 2.5 0 1 1 0-5a2.5 2.5 0 0 1 0 5Z"/>
            </svg>
        )
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path fill="currentColor"
                  d="M12 21a9 9 0 1 0-9-9c0 1.49.36 2.89 1 4.13L3 21l4.87-1A8.95 8.95 0 0 0 12 21Zm-4-8.5a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Zm4 0a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Zm4 0a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Z"/>
        </svg>
    )
}

function BellIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path fill="currentColor"
                  d="M427.68 351.43C402 320 383.87 304 383.87 217.35C383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53c-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43C73.68 364.45 83 384 101.61 384h308.88c18.51 0 27.77-19.61 17.19-32.57M320 384v16a64 64 0 0 1-128 0v-16"/>
        </svg>
    )
}
