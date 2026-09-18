import styles from '../styles/pages/notifications.module.scss';
import {Helmet} from "@dr.pogodin/react-helmet";
import {Link} from "react-router-dom";
import {type ReactNode, useEffect, useState} from "react";
import {NotificationAPI} from "../typed/notification.ts";
import {getNotifications, markAllNotificationsRead, markNotificationRead} from "../api/notifications.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {clearUnreadCount, setUnreadCount} from "../redux/slice/notification_slice.ts";
import {formatRelativeTime, pluralize} from "../utils.tsx";

export default function Notifications() {
    const dispatch = useAppDispatch();
    const userStatus = useAppSelector(state => state.user.status);
    const unreadCount = useAppSelector(state => state.notifications.unreadCount);
    const [notifications, setNotifications] = useState<NotificationAPI[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [actionError, setActionError] = useState(false);
    const [requestVersion, setRequestVersion] = useState(0);

    useEffect(() => {
        if (userStatus === "loading") return;

        let active = true;
        setLoading(true);
        setError(false);
        setActionError(false);

        getNotifications().then((response) => {
            if (!active) return;

            if (!response) {
                setError(true);
                setLoading(false);
                return;
            }

            setNotifications(response.notifications);
            dispatch(setUnreadCount(response.unread_count));
            setLoading(false);
        });

        return () => {
            active = false;
        }
    }, [dispatch, requestVersion, userStatus]);

    const unreadNotifications = notifications.filter(notification => !notification.read_at);
    const earlierNotifications = notifications.filter(notification => notification.read_at);

    const openNotification = (notification: NotificationAPI) => {
        if (notification.read_at) return;

        void markNotificationRead(notification.id).then(success => {
            if (!success) {
                setActionError(true);
                return;
            }

            setNotifications(current => current.map(item => item.id === notification.id
                ? {...item, read_at: new Date()}
                : item
            ));
            dispatch(setUnreadCount(Math.max(0, unreadCount - 1)));
        });
    }

    const markAllRead = async () => {
        if (markingAll || unreadCount === 0) return;

        setMarkingAll(true);
        setActionError(false);
        const success = await markAllNotificationsRead();

        if (success) {
            const readAt = new Date();
            setNotifications(current => current.map(notification => ({
                ...notification,
                read_at: notification.read_at ?? readAt
            })));
            dispatch(clearUnreadCount());
        } else {
            setActionError(true);
        }

        setMarkingAll(false);
    }

    return (
        <>
            <Helmet>
                <title>Notifications - SpaceRead</title>
            </Helmet>

            <div className={styles.notificationsPage} aria-busy={loading}>
                <section className={styles.pageHeader}>
                    <div className={styles.headerCopy}>
                        <span className={styles.eyebrow}>Your activity</span>
                        <h1>Notifications</h1>
                        <p>Replies and mentions from your conversations.</p>
                    </div>

                    {!loading && !error && (
                        <div className={styles.headerSignals} aria-label={"Notification summary"}>
                            {unreadCount > 0 ? (
                                <span className={styles.headerSignal}>
                                    <strong>{unreadCount}</strong>
                                    <span>unread</span>
                                </span>
                            ) : (
                                <span className={styles.headerSignal}>
                                    <CheckIcon/>
                                    <strong>All caught up</strong>
                                </span>
                            )}
                            {notifications.length > 0 && (
                                <span className={styles.headerSignal}>
                                    <strong>{notifications.length}</strong>
                                    <span>recent {pluralize(notifications.length, "update")}</span>
                                </span>
                            )}
                            {unreadCount > 0 && (
                                <button
                                    className={styles.markAllButton}
                                    type={"button"}
                                    disabled={markingAll}
                                    onClick={() => void markAllRead()}
                                >
                                    {markingAll ? "Marking..." : "Mark all as read"}
                                </button>
                            )}
                        </div>
                    )}
                </section>

                {actionError && (
                    <div className={styles.actionError} role={"alert"}>
                        We couldn't update the read status. Please try again.
                    </div>
                )}

                {loading && <NotificationSkeleton/>}

                {!loading && error && (
                    <StatusPanel
                        kind={"error"}
                        title={"Notifications are unavailable"}
                        copy={"We couldn't load your updates. Check your connection and try again."}
                        action={<button type={"button"} onClick={() => setRequestVersion(version => version + 1)}>Try again</button>}
                    />
                )}

                {!loading && !error && notifications.length === 0 && (
                    <StatusPanel
                        kind={"empty"}
                        title={"You're all caught up"}
                        copy={"When someone replies to your review or mentions you in a conversation, you'll find it here."}
                        action={<Link to={"/professor"}>Explore professors <ArrowIcon/></Link>}
                    />
                )}

                {!loading && !error && notifications.length > 0 && (
                    <div className={styles.notificationFeed}>
                        {unreadNotifications.length > 0 && (
                            <NotificationGroup
                                title={"New"}
                                notifications={unreadNotifications}
                                onOpen={openNotification}
                            />
                        )}

                        {earlierNotifications.length > 0 && (
                            <NotificationGroup
                                title={unreadNotifications.length > 0 ? "Earlier" : "Recent"}
                                notifications={earlierNotifications}
                                onOpen={openNotification}
                            />
                        )}
                    </div>
                )}
            </div>
        </>
    )
}

function NotificationGroup(props: {
    title: string;
    notifications: NotificationAPI[];
    onOpen: (notification: NotificationAPI) => void;
}) {
    const headingId = `notification-group-${props.title.toLowerCase()}`;

    return (
        <section className={styles.notificationGroup} aria-labelledby={headingId}>
            <div className={styles.groupHeading}>
                <h2 id={headingId}>{props.title}</h2>
                <span>{props.notifications.length} {pluralize(props.notifications.length, "update")}</span>
            </div>
            <ul className={styles.notificationList}>
                {props.notifications.map(notification => (
                    <li key={notification.id}>
                        <NotificationItem notification={notification} onOpen={props.onOpen}/>
                    </li>
                ))}
            </ul>
        </section>
    )
}

function NotificationItem(props: {
    notification: NotificationAPI;
    onOpen: (notification: NotificationAPI) => void;
}) {
    const notification = props.notification;
    const unread = !notification.read_at;

    return (
        <Link
            to={notification.href}
            className={`${styles.notificationItem} ${unread ? styles.unread : ""}`}
            onClick={() => props.onOpen(notification)}
        >
            <span className={`${styles.notificationGlyph} ${notification.type === "reply_mention" ? styles.mentionGlyph : ""}`}>
                <NotificationIcon type={notification.type}/>
                {unread && <span className={styles.unreadDot} aria-label={"Unread"}/>}
            </span>
            <span className={styles.notificationContent}>
                <strong dir={"auto"}>{notification.title}</strong>
                <span className={styles.notificationBody} dir={"auto"}>{notification.body}</span>
                <span className={styles.notificationMeta}>
                    <span>{notification.type === "reply_mention" ? "Mention" : "Reply"}</span>
                    <span className={styles.metaDot} aria-hidden={true}/>
                    <time dateTime={new Date(notification.created_at).toISOString()}>
                        {formatRelativeTime(new Date(notification.created_at))}
                    </time>
                </span>
            </span>
            <span className={styles.chevron} aria-hidden={true}>
                <ChevronIcon/>
            </span>
        </Link>
    )
}

function StatusPanel(props: {
    kind: "empty" | "error";
    title: string;
    copy: string;
    action: ReactNode;
}) {
    return (
        <section
            className={`${styles.statusPanel} ${props.kind === "error" ? styles.errorPanel : ""}`}
            role={props.kind === "error" ? "alert" : "status"}
        >
            <span className={styles.statusIllustration} aria-hidden={true}>
                {props.kind === "error" ? <WarningIcon/> : <BellIcon/>}
            </span>
            <h2>{props.title}</h2>
            <p>{props.copy}</p>
            <div className={styles.statusAction}>{props.action}</div>
        </section>
    )
}

function NotificationSkeleton() {
    return (
        <div className={styles.skeletonWrap} role={"status"}>
            <span className={styles.visuallyHidden}>Loading notifications...</span>
            <div className={styles.skeletonHeading}/>
            <div className={styles.skeletonList}>
                {[0, 1, 2].map(item => (
                    <div className={styles.skeletonItem} key={item} aria-hidden={true}>
                        <span className={styles.skeletonIcon}/>
                        <span className={styles.skeletonLines}>
                            <span/>
                            <span/>
                            <span/>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function NotificationIcon({type}: { type: NotificationAPI["type"] }) {
    if (type === "reply_mention") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
                <path fill="currentColor"
                      d="M12 3a9 9 0 0 0 0 18h4.5a1 1 0 1 0 0-2H12a7 7 0 1 1 6.87-8.3c.08.43.13.87.13 1.3v1.5a1.5 1.5 0 0 1-3 0V8a1 1 0 0 0-2 0v.35A4.49 4.49 0 1 0 14.74 15A3.5 3.5 0 0 0 21 12v-1a8 8 0 0 0-.16-1.6A9 9 0 0 0 12 3Zm0 11a2.5 2.5 0 1 1 0-5a2.5 2.5 0 0 1 0 5Z"/>
            </svg>
        )
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="currentColor"
                  d="M12 21a9 9 0 1 0-9-9c0 1.49.36 2.89 1 4.13L3 21l4.87-1A8.95 8.95 0 0 0 12 21Zm-4-8.5a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Zm4 0a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Zm4 0a1.25 1.25 0 1 1 0-2.5a1.25 1.25 0 0 1 0 2.5Z"/>
        </svg>
    )
}

function BellIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="currentColor"
                  d="M18 8a6 6 0 0 0-5-5.91V1a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 8c0 7-3 7-3 9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1c0-2-3-2-3-9Zm-8.73 12a3 3 0 0 0 5.46 0H9.27Z"/>
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="m5 12 4 4L19 6"/>
        </svg>
    )
}

function ChevronIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="m9 18 6-6-6-6"/>
        </svg>
    )
}

function ArrowIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M5 12h14m-6-6 6 6-6 6"/>
        </svg>
    )
}

function WarningIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden={true}>
            <path fill="currentColor"
                  d="M11.13 3.52 2.18 19a1.5 1.5 0 0 0 1.3 2.25h17.04a1.5 1.5 0 0 0 1.3-2.25L12.87 3.52a1 1 0 0 0-1.74 0ZM11 9h2v5h-2V9Zm1 8.75a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/>
        </svg>
    )
}
