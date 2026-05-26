import {useEffect} from "react";
import {getNotificationSummary} from "../api/notifications.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {setUnreadCount} from "../redux/slice/notification_slice.ts";

const NOTIFICATION_SUMMARY_INTERVAL_MS = 20 * 1000;
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
        let isMouseInside = document.hasFocus();
        let lastRefreshAt = 0;
        let lastActivityAt = Date.now();
        let requestInFlight = false;

        const canPoll = () => (
            active &&
            document.visibilityState === "visible" &&
            document.hasFocus() &&
            isMouseInside &&
            !isUserIdle
        );

        const refreshNotificationSummary = async () => {
            if (!canPoll()) return;

            const now = Date.now();
            if (now - lastActivityAt >= NOTIFICATION_IDLE_TIMEOUT_MS) {
                isUserIdle = true;
                stopPolling();
                return;
            }
            if (now - lastRefreshAt < NOTIFICATION_SUMMARY_INTERVAL_MS) return;
            if (requestInFlight) return;

            lastRefreshAt = now;
            requestInFlight = true;

            try {
                const response = await getNotificationSummary();
                if (!active || !response) return;

                dispatch(setUnreadCount(response.unread_count));
            } finally {
                requestInFlight = false;
            }
        };

        const stopPolling = () => {
            if (!interval) return;

            window.clearInterval(interval);
            interval = undefined;
        };

        const startPolling = () => {
            if (interval || !canPoll()) return;

            refreshNotificationSummary();
            interval = window.setInterval(refreshNotificationSummary, NOTIFICATION_SUMMARY_INTERVAL_MS);
        };

        const syncPolling = () => {
            if (canPoll()) {
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
            lastActivityAt = Date.now();
            isUserIdle = false;
            markIdleAfterDelay();

            if (wasIdle) {
                syncPolling();
            }
        };

        const handleMouseEnter = () => {
            isMouseInside = true;
            handleUserActivity();
            syncPolling();
        };

        const handleMouseOut = (event: MouseEvent) => {
            if (event.relatedTarget) return;

            isMouseInside = false;
            stopPolling();
        };

        startPolling();
        markIdleAfterDelay();

        window.addEventListener("focus", syncPolling);
        window.addEventListener("blur", syncPolling);
        document.addEventListener("visibilitychange", syncPolling);
        window.addEventListener("mouseover", handleMouseEnter);
        window.addEventListener("mouseout", handleMouseOut);
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
            window.removeEventListener("mouseover", handleMouseEnter);
            window.removeEventListener("mouseout", handleMouseOut);
            window.removeEventListener("mousemove", handleUserActivity);
            window.removeEventListener("mousedown", handleUserActivity);
            window.removeEventListener("keydown", handleUserActivity);
            window.removeEventListener("touchstart", handleUserActivity);
            window.removeEventListener("scroll", handleUserActivity);
        };
    }, [dispatch, userStatus]);

    return null;
}
