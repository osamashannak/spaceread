export type MySpaceReviewStatus = "published" | "held" | "hidden";
export type MySpaceReplyStatus = "published" | "hidden";
export type MySpaceUploadStatus = "approved" | "pending" | "rejected";

export interface MySpaceUserAPI {
    id: string;
    username: string;
    role: string;
}

export interface MySpaceSummaryAPI {
    reviews: number;
    replies: number;
    uploads: number;
    pending_uploads: number;
    unread_notifications: number;
}

export interface MySpaceReviewAPI {
    id: string;
    professor_email: string;
    professor_name: string;
    score: number;
    positive: boolean;
    text: string;
    visible: boolean;
    reviewed: boolean;
    status: MySpaceReviewStatus;
    like_count: number;
    dislike_count: number;
    reply_count: number;
    course_taken?: string;
    grade_received?: string;
    created_at: string;
}

export interface MySpaceReplyAPI {
    id: string;
    review_id: string;
    professor_email: string;
    professor_name: string;
    review_preview: string;
    comment: string;
    visible: boolean;
    status: MySpaceReplyStatus;
    like_count: number;
    created_at: string;
}

export interface MySpaceUploadAPI {
    id: string;
    course_tag: string;
    course_name: string;
    name: string;
    type: string;
    size: number;
    download_count: number;
    visible: boolean;
    reviewed: boolean;
    reviewed_at?: string;
    status: MySpaceUploadStatus;
    created_at: string;
}

export interface MySpaceAPI {
    user: MySpaceUserAPI;
    summary: MySpaceSummaryAPI;
    reviews: MySpaceReviewAPI[];
    replies: MySpaceReplyAPI[];
    uploads: MySpaceUploadAPI[];
}
