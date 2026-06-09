import {dispatchAdminAuthLost} from "@/lib/admin_auth";

const adminEndpoint = stripTrailingSlash(import.meta.env.VITE_ADMIN_ENDPOINT || "/api/admin");
const csrfCookieName = import.meta.env.VITE_CSRF_COOKIE_NAME || "sr_c";

export class AdminApiError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "AdminApiError";
        this.status = status;
        this.code = code;
    }
}

export type AdminReason = {
    code: string;
    label: string;
    policy_area: string;
    policy_reference?: string;
    active: boolean;
    sort_order: number;
};

export type AdminReviewListResponse = {
    reviews: AdminReview[];
    limit: number;
    offset: number;
};

export type AdminSuspiciousReviewPairListResponse = {
    pairs: AdminSuspiciousReviewPair[];
    limit: number;
    offset: number;
};

export type AdminReviewFilters = {
    sort: "newest" | "oldest" | "most_reports" | "most_signals" | "random";
    needs_attention: boolean;
    deleted: "exclude" | "include" | "only";
    visible: "any" | "visible" | "hidden";
    reviewed: "any" | "reviewed" | "not_reviewed";
    positive: "any" | "recommended" | "not_recommended";
    student_verified: "any" | "verified" | "not_verified";
    uaeu_origin: "any" | "uaeu" | "non_uaeu";
    media: "any" | "with_media" | "without_media" | "attachment" | "gif";
    open_reports: "any" | "has" | "none";
    signals: "any" | "has" | "none";
    has_session: "any" | "has" | "none";
    has_user: "any" | "has" | "none";
    has_ip: "any" | "has" | "none";
    search: string;
    review_id: string;
    professor_email: string;
    professor_name: string;
    professor_college: string;
    professor_university: string;
    language: string;
    course_taken: string;
    grade_received: string;
    moderation_reason_code: string;
    reviewer_user_id: string;
    session_id: string;
    user_id: string;
    ip_address: string;
    score_min: string;
    score_max: string;
    like_min: string;
    like_max: string;
    dislike_min: string;
    dislike_max: string;
    reply_min: string;
    reply_max: string;
    created_from: string;
    created_to: string;
    reviewed_from: string;
    reviewed_to: string;
};

export type AdminSuspiciousReviewFilters = {
    min_score: string;
    similarity_threshold: string;
    visible: "at_least_one" | "both" | "include_hidden";
    search: string;
    professor_email: string;
};

export type AdminReasonsResponse = {
    reasons: AdminReason[];
};

export type AdminReasonResponse = {
    reason: AdminReason;
};

export type AdminSessionResponse = {
    user: {
        id: string;
        username?: string;
        email?: string;
        role: string;
    };
};

export type AdminDecisionResponse = {
    success: boolean;
    review: AdminReview;
    resolved_report_count: number;
    action: string;
};

export type AdminPairDecisionResponse = {
    success: boolean;
    review_1: AdminReview;
    review_2: AdminReview;
    resolved_report_count: number;
    action: string;
};

export type AdminReplyDecisionResponse = {
    success: boolean;
    review: AdminReview;
    reply: AdminReviewReply;
    action: string;
};

export type AdminReview = {
    sort_index: string;
    id: string;
    professor_email: string;
    professor_name: string;
    professor_college?: string;
    professor_university?: string;
    score: number;
    positive: boolean;
    text: string;
    created_at: string;
    language: string;
    like_count: number;
    dislike_count: number;
    reply_count: number;
    grade_received?: string;
    course_taken?: string;
    attachment?: AdminReviewAttachment;
    gif?: string;
    visible: boolean;
    reviewed: boolean;
    reviewed_at?: string;
    reviewer_user_id?: string;
    deleted_at?: string;
    uaeu_origin: boolean;
    student_verified: boolean;
    session_id?: string;
    user_id?: string;
    ip_address?: string;
    moderation_reason_code?: string;
    moderation_note?: string;
    reports: AdminReviewReport[];
    replies: AdminReviewReply[];
    ratings: AdminReviewRating[];
    signals: AdminModerationSignal[];
    action_history: AdminModerationAction[];
};

export type AdminSuspiciousReviewPair = {
    review_1: AdminReview;
    review_2: AdminReview;
    suspicion_score: number;
    content_similarity: number;
    created_delta_seconds: number;
    same_ip: boolean;
    same_user: boolean;
    similar_content: boolean;
    same_language: boolean;
    same_score: boolean;
    same_recommendation: boolean;
    close_timing: boolean;
};

export type AdminReviewAttachment = {
    id: string;
    mime_type: string;
    size: number;
    width: number;
    height: number;
    visible: boolean;
    reviewed: boolean;
    reviewed_at?: string;
    reviewer_user_id?: string;
    moderation_reason_code?: string;
    moderation_note?: string;
    created_at: string;
    url: string;
    blob_name: string;
    ip_address?: string;
};

export type AdminReviewReport = {
    id: string;
    review_id: string;
    reason: string;
    session_id: string;
    user_id?: string;
    created_at: string;
    resolved: boolean;
    resolved_at?: string;
    resolver_user_id?: string;
    resolution_action?: string;
    resolution_reason_code?: string;
    resolution_note?: string;
};

export type AdminReviewReply = {
    id: string;
    review_id: string;
    text: string;
    gif?: string;
    visible: boolean;
    reviewed: boolean;
    reviewed_at?: string;
    reviewer_user_id?: string;
    moderation_reason_code?: string;
    moderation_note?: string;
    deleted_at?: string;
    created_at: string;
    author?: string;
    mention?: string;
    op: boolean;
    like_count: number;
    session_id: string;
    user_id?: string;
    ip_address?: string;
};

export type AdminReviewRating = {
    review_id: string;
    value: "like" | "dislike";
    session_id: string;
    user_id?: string;
    ip_address: string;
    created_at: string;
};

export type AdminModerationSignal = {
    id?: string;
    target_type: string;
    target_id: string;
    source: string;
    attribute: string;
    score?: number;
    threshold?: number;
    severity?: string;
    payload?: unknown;
    created_at: string;
};

export type AdminModerationAction = {
    id: string;
    actor_user_id?: string;
    target_type: string;
    target_id: string;
    action: string;
    reason_code?: string;
    note?: string;
    previous_state?: unknown;
    next_state?: unknown;
    created_at: string;
};

export type AdminReviewReplyResponse = {
    reply: AdminReviewReply;
    parent_review: AdminReview;
    likes: AdminReplyLike[];
    signals: AdminModerationSignal[];
    action_history: AdminModerationAction[];
};

export type AdminReplyLike = {
    reply_id: string;
    session_id: string;
    user_id?: string;
    ip_address?: string;
    created_at: string;
};

export type AdminEntitySession = {
    id: string;
    user_id?: string;
    user_agent?: string;
    ip_address: string;
    created_at?: string;
};

export type AdminUserAccount = {
    id: string;
    username: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    last_login_at?: string;
};

export type AdminUserIdentity = {
    id: string;
    provider: string;
    email: string;
    email_verified: boolean;
    created_at: string;
};

export type AdminLoginSession = {
    id: string;
    user_id: string;
    session_id: string;
    created_at: string;
    last_seen_at?: string;
    expires_at: string;
    revoked_at?: string;
    user_agent?: string;
    ip_address?: string;
};

export type AdminEntityStats = {
    hidden_content_count: number;
    open_report_count: number;
    signal_count: number;
    recent_activity_count: number;
    distinct_session_count?: number;
    distinct_user_count?: number;
    first_seen?: string;
    last_seen?: string;
};

export type AdminEntityActivity = {
    reviews: AdminReviewSummary[];
    replies: AdminReviewReplySummary[];
    reports: AdminReviewReportSummary[];
    ratings: AdminReviewRatingSummary[];
    reply_likes: AdminReplyLike[];
    professor_requests: AdminProfessorRequestSummary[];
    course_files: AdminCourseFileSummary[];
    attachments: AdminReviewAttachmentSummary[];
    signals: AdminModerationSignal[];
    actions: AdminModerationAction[];
};

export type AdminReviewSummary = {
    id: string;
    professor_email: string;
    professor_name: string;
    score: number;
    positive: boolean;
    text: string;
    created_at: string;
    visible: boolean;
    reviewed: boolean;
    deleted_at?: string;
    like_count: number;
    dislike_count: number;
    reply_count: number;
    session_id?: string;
    user_id?: string;
    ip_address?: string;
    open_report_count: number;
    signal_count: number;
    media_kind?: "attachment" | "gif";
};

export type AdminReviewReplySummary = {
    id: string;
    review_id: string;
    professor_email: string;
    professor_name: string;
    text: string;
    created_at: string;
    visible: boolean;
    reviewed: boolean;
    deleted_at?: string;
    author?: string;
    mention?: string;
    op: boolean;
    like_count: number;
    session_id: string;
    user_id?: string;
    ip_address?: string;
};

export type AdminReviewReportSummary = {
    id: string;
    review_id: string;
    reason: string;
    session_id: string;
    user_id?: string;
    created_at: string;
    resolved: boolean;
    resolved_at?: string;
    review_text: string;
    professor_name: string;
};

export type AdminReviewRatingSummary = {
    review_id: string;
    professor_name: string;
    value: "like" | "dislike";
    session_id: string;
    user_id?: string;
    ip_address: string;
    created_at: string;
};

export type AdminReviewAttachmentSummary = {
    id: string;
    review_id?: string;
    mime_type: string;
    size: number;
    width: number;
    height: number;
    visible: boolean;
    reviewed: boolean;
    blob_name: string;
    ip_address?: string;
    created_at: string;
    url: string;
};

export type AdminProfessorRequestSummary = {
    id: string;
    professor_name: string;
    professor_email?: string;
    university: string;
    college?: string;
    status: string;
    session_id: string;
    user_id?: string;
    created_at: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
    moderation_reason_code?: string;
    moderation_note?: string;
};

export type AdminCourseFileSummary = {
    id: string;
    name: string;
    type: string;
    size: number;
    visible: boolean;
    reviewed: boolean;
    course_tag: string;
    download_count: number;
    created_at: string;
    user_id?: string;
    session_id?: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
    moderation_reason_code?: string;
    moderation_note?: string;
};

export type AdminSessionDetailResponse = {
    session: AdminEntitySession;
    stats: AdminEntityStats;
    activity: AdminEntityActivity;
    login_sessions: AdminLoginSession[];
};

export type AdminUserDetailResponse = {
    user: AdminUserAccount;
    identities: AdminUserIdentity[];
    sessions: AdminEntitySession[];
    login_sessions: AdminLoginSession[];
    stats: AdminEntityStats;
    activity: AdminEntityActivity;
};

export type AdminIPDetailResponse = {
    ip_address: string;
    stats: AdminEntityStats;
    sessions: AdminEntitySession[];
    login_sessions: AdminLoginSession[];
    activity: AdminEntityActivity;
};

export async function listAdminReasons(signal?: AbortSignal) {
    return adminFetch<AdminReasonsResponse>("/reasons", {signal});
}

export async function updateAdminReason(
    code: string,
    body: {
        code: string;
        label: string;
        policy_area: string;
        policy_reference?: string;
        active: boolean;
        sort_order: number;
    },
) {
    return adminFetch<AdminReasonResponse>(`/reasons/${encodeURIComponent(code)}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function getAdminSession(signal?: AbortSignal) {
    return adminFetch<AdminSessionResponse>("/session", {signal});
}

export async function listAdminReviews(signal?: AbortSignal, filters?: AdminReviewFilters) {
    const params = new URLSearchParams({limit: "100"});
    if (filters) {
        for (const [key, value] of Object.entries(filters)) {
            if (value !== "" && value !== "any") {
                params.set(key, String(value));
            }
        }
    }
    return adminFetch<AdminReviewListResponse>(`/reviews?${params.toString()}`, {signal});
}

export async function listAdminSuspiciousReviewPairs(signal?: AbortSignal, filters?: AdminSuspiciousReviewFilters) {
    const params = new URLSearchParams({limit: "100"});
    if (filters) {
        for (const [key, value] of Object.entries(filters)) {
            if (value !== "") {
                params.set(key, String(value));
            }
        }
    }
    return adminFetch<AdminSuspiciousReviewPairListResponse>(`/reviews/suspicious?${params.toString()}`, {signal});
}

export async function getAdminReview(reviewId: string, signal?: AbortSignal) {
    return adminFetch<{ review: AdminReview }>(`/reviews/${encodeURIComponent(reviewId)}`, {signal});
}

export async function getAdminReviewReply(replyId: string, signal?: AbortSignal) {
    return adminFetch<AdminReviewReplyResponse>(`/review-replies/${encodeURIComponent(replyId)}`, {signal});
}

export async function getAdminSessionDetail(sessionId: string, signal?: AbortSignal) {
    return adminFetch<AdminSessionDetailResponse>(`/sessions/${encodeURIComponent(sessionId)}`, {signal});
}

export async function getAdminUserDetail(userId: string, signal?: AbortSignal) {
    return adminFetch<AdminUserDetailResponse>(`/users/${encodeURIComponent(userId)}`, {signal});
}

export async function getAdminIPDetail(address: string, signal?: AbortSignal) {
    return adminFetch<AdminIPDetailResponse>(`/ip-addresses/lookup?address=${encodeURIComponent(address)}`, {signal});
}

export async function setReviewVisibility(
    reviewId: string,
    body: { visible: boolean; reason_code?: string; note?: string; resolve_reports?: boolean },
) {
    return adminFetch<AdminDecisionResponse>(`/reviews/${encodeURIComponent(reviewId)}/visibility`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function hideSuspiciousReviewPair(
    body: { review_1_id: string; review_2_id: string; reason_code: string; note?: string; resolve_reports?: boolean },
) {
    return adminFetch<AdminPairDecisionResponse>("/reviews/suspicious/hide-pair", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function saveReviewNote(reviewId: string, body: { note: string }) {
    return adminFetch<AdminDecisionResponse>(`/reviews/${encodeURIComponent(reviewId)}/note`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function setReviewReplyVisibility(
    replyId: string,
    body: { visible: boolean; reason_code?: string; note?: string },
) {
    return adminFetch<AdminReplyDecisionResponse>(`/review-replies/${encodeURIComponent(replyId)}/visibility`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function markReviewReplyReviewed(
    replyId: string,
    body: { reason_code?: string; note?: string },
) {
    return adminFetch<AdminReplyDecisionResponse>(`/review-replies/${encodeURIComponent(replyId)}/review`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function saveReviewReplyNote(replyId: string, body: { note: string }) {
    return adminFetch<AdminReplyDecisionResponse>(`/review-replies/${encodeURIComponent(replyId)}/note`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function setReviewAttachmentVisibility(
    attachmentId: string,
    body: { visible: boolean; reason_code?: string; note?: string },
) {
    return adminFetch<AdminDecisionResponse>(`/review-attachments/${encodeURIComponent(attachmentId)}/visibility`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method || "GET";
    const headers = new Headers(init.headers);

    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    if (!isSafeMethod(method) && !headers.has("X-Csrf-Token")) {
        const token = getCookie(csrfCookieName);
        if (token) {
            headers.set("X-Csrf-Token", token);
        }
    }

    const response = await fetch(`${adminEndpoint}${path}`, {
        ...init,
        method,
        headers,
        credentials: "include",
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            dispatchAdminAuthLost(response.status);
        }
        throw await apiError(response);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

async function apiError(response: Response) {
    try {
        const data = await response.json() as { message?: string; code?: string };
        return new AdminApiError(data.message || response.statusText, response.status, data.code);
    } catch {
        return new AdminApiError(response.statusText || "Request failed", response.status);
    }
}

function getCookie(name: string) {
    const prefix = `${encodeURIComponent(name)}=`;
    return document.cookie
        .split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(prefix))
        ?.slice(prefix.length);
}

function stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

function isSafeMethod(method: string) {
    return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
