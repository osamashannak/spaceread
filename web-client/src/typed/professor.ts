export interface ProfessorAPI {
    email: string;
    name: string;
    college: string;
    university: string;
    reviews: ReviewAPI[];
    score: number;
    reviewed: boolean;
    courses: string[];
    similar_professors: SimilarProfessors[]
}

export interface ProfessorRequestFormAPI {
    professor_name: string;
    university: string;
    professor_email?: string;
    college?: string;
}

export interface SimilarProfessors {
    professor_email: string;
    professor_name: string;
    professor_college: string;
    reviews_count: number;
    review_preview: string;
    score: number;
}

export interface ReviewAPI {
    sort_index: string;
    id: string;
    author: string;
    score: number;
    positive: boolean;
    text: string;
    created_at: Date;
    like_count: number;
    dislike_count: number;
    reply_count: number;
    language: string;
    self: boolean;
    rated: string | null;
    fadeIn: boolean;
    flagged: boolean;
    verified: boolean;
    course_taken: string;
    grade_received: string;
    uaeu_origin: boolean;
    gif?: string;
    pinned?: boolean;
    warning?: ReviewPolicyWarning;
    attachment?: {
        id: string;
        height: number;
        width: number;
        url: string;
    };
}

export interface ReviewReplyAPI {
    id: string;
    author: string;
    comment: string;
    gif?: string;
    mention?: string;
    like_count: number;
    self: boolean;
    liked: boolean;
    op: boolean;
    created_at: Date;
    fadeIn?: boolean;
}


export interface ImageAttachment {
    id: string;
    url: string;
    height: number;
    width: number;
    src: File | Blob;
}

export interface VideoAttachment {
    id: string;
    url: string;
    weight: 4;
    height: number;
    width: number;
    videoSrc: File | Blob;
}


export interface ReviewFormDraft {
    score?: number;
    positive?: boolean;
    comment: string;
    attachment?: ImageAttachment;
    gif?: GifPreview;
    course_taken: string;
    grade_received: string;
}

export interface ReviewFormAPI {
    professor_email: string;
    recaptcha_token: string;
    score: number;
    positive: boolean;
    text: string;
    attachment?: string;
    gif?: string;
    course_taken: string;
    grade_received: string;
    policy_warning_acknowledged?: string;
}

export interface ReviewPolicyWarning {
    code: string;
    reason_code: string;
    title: string;
    message: string;
}

export type ReviewPostResult =
    | { kind: "review"; review: ReviewAPI };

export interface ProfessorHistory {
    name: string;
    email: string;
    university: string;
    date: Date;
}

export interface ReviewComposeProps {
    id: string;
    reviewId: string;
    author: string;
    comment: string;
    replyMention?: string;
    mention?: string;
    op: boolean;
    created_at: Date;
    showReplyCompose: (show: boolean) => void;
}

export interface ReplyContent {
    comment: string | "";
    gif?: GifPreview;
}

export interface GifPreview {
    url: string;
    previewUrl?: string;
    width: number;
    height: number;
    provider?: "klipy" | "tenor";
    id?: string;
    title?: string;
    analytics?: {
        onload?: { url: string };
        onclick?: { url: string };
        onsent?: { url: string };
    };
}
