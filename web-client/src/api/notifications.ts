import {NotificationSummaryAPI, NotificationsResponseAPI} from "../typed/notification.ts";
import {csrfHeader} from "./csrf.ts";

const HOST = import.meta.env.VITE_AUTH_ENDPOINT;

export async function getNotifications(limit = 50) {
    let response;

    try {
        const request = await fetch(HOST + `/gate/notifications?limit=${limit}`, {
            credentials: "include"
        });

        if (!request.ok) return undefined;
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response as NotificationsResponseAPI;
}

export async function getNotificationSummary() {
    let response;

    try {
        const request = await fetch(HOST + "/gate/notifications/summary", {
            credentials: "include"
        });

        if (!request.ok) return undefined;
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response as NotificationSummaryAPI;
}

export async function markAllNotificationsRead() {
    try {
        const request = await fetch(HOST + "/gate/notifications/read", {
            method: "POST",
            headers: csrfHeader(),
            credentials: "include"
        });

        if (!request.ok) return false;
        const response = await request.json();
        return response.success as boolean;
    } catch (error) {
        return false;
    }
}

export async function markNotificationRead(notificationId: string) {
    try {
        const request = await fetch(HOST + `/gate/notifications/read?notificationId=${notificationId}`, {
            method: "POST",
            headers: csrfHeader(),
            credentials: "include"
        });

        if (!request.ok) return false;
        const response = await request.json();
        return response.success as boolean;
    } catch (error) {
        return false;
    }
}
