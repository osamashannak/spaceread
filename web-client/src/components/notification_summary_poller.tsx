import {useEffect} from "react";
import {getNotificationSummary} from "../api/notifications.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {setUnreadCount} from "../redux/slice/notification_slice.ts";

const NOTIFICATION_SUMMARY_INTERVAL_MS = 15000;

export default function NotificationSummaryPoller() {
    const dispatch = useAppDispatch();
    const userStatus = useAppSelector(state => state.user.status);

    useEffect(() => {
        if (userStatus === "loading") return;

        let active = true;

        const refreshNotificationSummary = async () => {
            const response = await getNotificationSummary();
            if (!active || !response) return;

            dispatch(setUnreadCount(response.unread_count));
        };

        refreshNotificationSummary();

        const interval = window.setInterval(refreshNotificationSummary, NOTIFICATION_SUMMARY_INTERVAL_MS);

        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") {
                refreshNotificationSummary();
            }
        };

        window.addEventListener("focus", refreshNotificationSummary);
        document.addEventListener("visibilitychange", refreshWhenVisible);

        return () => {
            active = false;
            window.clearInterval(interval);
            window.removeEventListener("focus", refreshNotificationSummary);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [dispatch, userStatus]);

    return null;
}
