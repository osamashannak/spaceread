import {useEffect} from "react";
import {getNotificationSummary} from "../api/notifications.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {setUnreadCount} from "../redux/slice/notification_slice.ts";

const NOTIFICATION_SUMMARY_INTERVAL_MS = 30000;
const NOTIFICATION_IDLE_TIMEOUT_MS = 20 * 1000;

export default function NotificationSummaryPoller() {
    const dispatch = useAppDispatch();
    const userStatus = useAppSelector(state => state.user.status);

    useEffect(() => {
        if (userStatus === "loading") return;

        let active = true;
        let interval: number | undefined;
        let idleTimeout: number | undefined;
        let isUserIdle = false;

        const refreshNotificationSummary = async () => {
            if (document.visibilityState !== "visible" || !document.hasFocus() || isUserIdle) return;

            const response = await getNotificationSummary();
            if (!active || !response) return;

            dispatch(setUnreadCount(response.unread_count));
        };

        const stopPolling = () => {
            if (!interval) return;

            window.clearInterval(interval);
            interval = undefined;
        };

        const startPolling = () => {
            if (interval || document.visibilityState !== "visible" || !document.hasFocus() || isUserIdle) return;

            refreshNotificationSummary();
            interval = window.setInterval(refreshNotificationSummary, NOTIFICATION_SUMMARY_INTERVAL_MS);
        };

        const syncPolling = () => {
            if (document.visibilityState === "visible" && document.hasFocus() && !isUserIdle) {
                startPolling();
                return;
            }

            stopPolling();
        };

        const markIdleAfterDelay = () => {
            if (idleTimeout) window.clearTimeout(idleTimeout);

            idleTimeout = window.setTimeout(() => {
                isUserIdle = true;
                stopPolling();
            }, NOTIFICATION_IDLE_TIMEOUT_MS);
        };

        const handleUserActivity = () => {
            const wasIdle = isUserIdle;
            isUserIdle = false;
            markIdleAfterDelay();

            if (wasIdle) {
                syncPolling();
            }
        };

        startPolling();
        markIdleAfterDelay();

        window.addEventListener("focus", syncPolling);
        window.addEventListener("blur", syncPolling);
        document.addEventListener("visibilitychange", syncPolling);
        window.addEventListener("mousemove", handleUserActivity);
        window.addEventListener("mousedown", handleUserActivity);
        window.addEventListener("keydown", handleUserActivity);
        window.addEventListener("touchstart", handleUserActivity);
        window.addEventListener("scroll", handleUserActivity, {passive: true});

        return () => {
            active = false;
            stopPolling();
            if (idleTimeout) window.clearTimeout(idleTimeout);
            window.removeEventListener("focus", syncPolling);
            window.removeEventListener("blur", syncPolling);
            document.removeEventListener("visibilitychange", syncPolling);
            window.removeEventListener("mousemove", handleUserActivity);
            window.removeEventListener("mousedown", handleUserActivity);
            window.removeEventListener("keydown", handleUserActivity);
            window.removeEventListener("touchstart", handleUserActivity);
            window.removeEventListener("scroll", handleUserActivity);
        };
    }, [dispatch, userStatus]);

    return null;
}
