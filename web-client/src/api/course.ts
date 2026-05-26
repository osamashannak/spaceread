import {CourseItem} from "../typed/searchbox.ts";
import {CourseAPI} from "../typed/course.ts";
import {csrfHeader} from "./csrf.ts";
import {apiFailure, apiSuccess, type ApiResult} from "./errors.ts";

const HOST = import.meta.env.VITE_COURSE_ENDPOINT;

export const getCoursesList = async () => {
    let response;

    try {
        const request = await fetch(HOST + "/course/list", {
            cache: "no-cache"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response as CourseItem[];
}

export const getCourse = async (id: string) => {
    let response;

    try {
        const request = await fetch(HOST + "/course?tag=" + id, {
            cache: "no-cache"
        });
        response = await request.json();
    } catch (error) {
        return undefined;
    }

    return response as CourseAPI ?? null;
}

export const uploadFile = async (fileName: string, file: File, courseTag: string): Promise<ApiResult> => {
    const form = new FormData();
    form.set("course_tag", courseTag);
    form.set("file_name", fileName);
    form.set("contents", file);

    let response;

    try {
        response = await fetch(HOST + "/course/upload", {
            method: "POST",
            headers: csrfHeader(),
            body: form,
            credentials: "include"
        });
    } catch {
        return apiFailure(undefined, "courseUpload");
    }

    if (!response.ok) {
        return apiFailure(response, "courseUpload");
    }

    return apiSuccess(undefined);
}

export const getDownloadLink = (fileId: number) => {
    return HOST + "/course/download?fileId=" + fileId;
}
