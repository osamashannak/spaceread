import {
    ProfessorAPI,
    ReviewAPI,
    ReviewFormAPI,
    ReviewReplyAPI
} from "../typed/professor.ts";
import {ProfessorItem} from "../typed/searchbox.ts";
import {csrfHeader} from "./csrf.ts";
import {getUserFacingError} from "./errors.ts";


const HOST = import.meta.env.VITE_PROFESSOR_ENDPOINT;

export const getProfessorsList = async (university: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/professor/all?university=" + university);
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response as ProfessorItem[];
}

export const getProfessor = async (id: string, abortController: AbortController) => {
    let response;

    try {
        const request = await fetch(HOST + "/professor?email=" + id, {
            credentials: "include",
            signal: abortController.signal
        });
        if (!request.ok) {
            throw new Error(getUserFacingError(request, "professorLoad"));
        }
        response = await request.json();
    } catch (error) {
        throw error
    }

    if (response.error) {
        throw new Error("We couldn't load this professor. Refresh the page and try again.");
    }

    return response as ProfessorAPI ?? null;
}


export const uploadImageAttachment = async (file: File | Blob) => {
    let response;

    try {
        const formData = new FormData();
        formData.append("file", file);
        const request = await fetch(HOST + "/comment/attachment", {
            method: "POST",
            body: formData,
            headers: csrfHeader(),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response.id as string;
}

export const uploadVideoAttachment = async (file: File | Blob) => {
    let response;

    try {
        const formData = new FormData();
        formData.append("file", file);
        const request = await fetch(HOST + "/comment/attachment/uploadVideo", {
            method: "POST",
            body: formData,
            headers: csrfHeader(),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response.id as string;
}

export const getReplyName = async (reviewId: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/reply/name?reviewId=" + reviewId, {
            credentials: "include",
        });
        response = await request.json();
    } catch (error) {
        return null;
    }

    if (response.error) {
        return  undefined;
    }

    return response['name'] as string ?? null;
}

export const getReviewReplies = async (reviewId: string, current: string[]) => {
    let response;

    try {
        const request = await fetch(HOST + `/comment/reply?reviewId=${reviewId}&current=${current.join(",")}`, {
            credentials: "include",
        });
        response = await request.json();
    } catch (error) {
        return null;
    }

    if (response.error) {
        return  undefined;
    }

    return response as { replies: ReviewReplyAPI[], comments: number } ?? null;
}

export const postReply = async (reviewId: string, content: {comment: string, gif?: string }, replyId?: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/reply", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify({
                review_id: reviewId,
                reply_id: replyId,
                ...content,
            }),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response as ReviewReplyAPI;
}

export const likeReply = async (replyId: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/reply/like?replyId=" + replyId, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return false;
    }

    if (response.error) {
        return  undefined;
    }

    return response.success as boolean;

}

export const removeLikeReply = async (replyId: string) => {
    let response;

    try {
        const request = await fetch(HOST + `/comment/reply/like?replyId=${replyId}`, {
            method: "DELETE",
            headers: csrfHeader(),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return false;
    }

    if (response.error) {
        return  undefined;
    }

    return response.success as boolean;
}

export const postReview = async (options: ReviewFormAPI) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify(options),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response as ReviewAPI;
}

export const deleteReview = async (reviewId: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment?reviewId=" + reviewId, {
            method: "DELETE",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response as { success: boolean, message: string };
}

export const translateReview = async (reviewId: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/translate?reviewId=" + reviewId, {
            method: "GET",
            headers: {
                'Content-Type': 'application/json',
            }
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response as { content: string, target: string };
}


export const reportReview = async (reviewId: string, reason: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/report", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify({
                review_id: reviewId,
                reason: reason
            }),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response.success as boolean ?? false;
}

export const deleteReply = async (replyId: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/comment/reply?replyId=" + replyId, {
            method: "DELETE",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response as { success: boolean, message: string };
}

export const addRating = async (review_id: string, rating: string) => {

    try {
        await fetch(HOST + "/comment/rating", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify({
                review_id,
                rating
            }),
            credentials: "include"
        });
    } catch (error) {
        return false;
    }


    return true;
}

export const removeRating = async (reviewId: string) => {

    try {
        await fetch(HOST + `/comment/rating?reviewId=${reviewId}`, {
            method: "DELETE",
            headers: csrfHeader(),
            credentials: "include"
        });
    } catch (error) {
        return false;
    }

    return true;
}

export const verifyStudentEmail = async (email: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/student/verify", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify({email}),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response.success as boolean;
}

export const submitOTP = async (email: string, otp: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/student/verify/submit", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...csrfHeader()
            },
            body: JSON.stringify({email, otp}),
            credentials: "include"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    if (response.error) {
        return  undefined;
    }

    return response.success as boolean;
}
