export interface NotificationAPI {
    id: string;
    type: "review_reply" | "reply_mention";
    title: string;
    body: string;
    href: string;
    read_at?: Date;
    created_at: Date;
}

export interface NotificationsResponseAPI {
    notifications: NotificationAPI[];
    unread_count: number;
}

export interface NotificationSummaryAPI {
    unread_count: number;
}
