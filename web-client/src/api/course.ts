import {CourseItem} from "../typed/searchbox.ts";
import {CourseAPI} from "../typed/course.ts";
import {csrfHeader} from "./csrf.ts";
import {apiFailure, apiSuccess, type ApiResult} from "./errors.ts";

const HOST = import.meta.env.VITE_COURSE_ENDPOINT;
const COURSE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
let courseListCache: {items: CourseItem[]; expiresAt: number} | undefined;
let pendingCourseList: Promise<CourseItem[] | undefined> | undefined;

export const getCoursesList = async (): Promise<CourseItem[] | undefined> => {
    if (courseListCache && Date.now() < courseListCache.expiresAt) {
        return courseListCache.items;
    }

    if (pendingCourseList) {
        return pendingCourseList;
    }

    const request = (async () => {
        try {
            const response = await fetch(HOST + "/course/list", {
                cache: "no-cache"
            });

            if (!response.ok) {
                return undefined;
            }

            const courses: unknown = await response.json();

            if (!Array.isArray(courses) || !courses.every((course): course is CourseItem =>
                course !== null && typeof course === "object"
                && typeof course.tag === "string" && typeof course.name === "string"
            )) {
                return undefined;
            }

            courseListCache = {
                items: courses,
                expiresAt: Date.now() + COURSE_LIST_CACHE_TTL_MS,
            };

            return courses;
        } catch {
            return undefined;
        }
    })();

    pendingCourseList = request;

    try {
        return await request;
    } finally {
        pendingCourseList = undefined;
    }
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
