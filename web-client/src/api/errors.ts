export type ApiErrorContext =
    | "login"
    | "signup"
    | "googleLogin"
    | "googleSignup"
    | "courseUpload"
    | "professorLoad"
    | "default";

export type ApiResult<T = undefined> =
    | { ok: true; data: T }
    | { ok: false; message: string; status?: number };

type ErrorCode = "email_taken" | "username_taken" | "account_taken" | string;

export function apiSuccess<T>(data: T): ApiResult<T> {
    return {ok: true, data};
}

export function apiFailure<T = undefined>(response: Response | undefined, context: ApiErrorContext): ApiResult<T> {
    return {
        ok: false,
        message: getUserFacingError(response, context),
        status: response?.status,
    };
}

export async function getUserFacingResponseError(response: Response | undefined, context: ApiErrorContext = "default") {
    return getUserFacingError(response, context, await readErrorCode(response));
}

export function getLoginError(response: Response | undefined, signInId: string) {
    const identifier = signInId.includes("@") ? "email" : "username";
    return getUserFacingError(response, "login", undefined, identifier);
}

export function getUserFacingError(
    response: Response | undefined,
    context: ApiErrorContext = "default",
    code?: ErrorCode,
    loginIdentifier?: "email" | "username",
) {
    if (!response) {
        return networkMessage(context);
    }

    switch (response.status) {
        case 400:
            return badRequestMessage(context, loginIdentifier);
        case 401:
            return unauthorizedMessage(context, loginIdentifier);
        case 403:
            return forbiddenMessage(context);
        case 404:
            return notFoundMessage(context);
        case 409:
            return conflictMessage(context, code);
        case 413:
            return tooLargeMessage(context);
        case 415:
            return unsupportedTypeMessage(context);
        case 429:
            return "Too many attempts. Wait a moment, then try again.";
        default:
            if (response.status >= 500) {
                return "Something went wrong on our side. Please try again in a moment.";
            }
            return "Something went wrong. Please try again.";
    }
}

async function readErrorCode(response: Response | undefined): Promise<ErrorCode | undefined> {
    if (!response) return undefined;

    try {
        const body = await response.clone().json() as { code?: unknown };
        return typeof body.code === "string" ? body.code : undefined;
    } catch {
        return undefined;
    }
}

function networkMessage(context: ApiErrorContext) {
    if (context === "login" || context === "signup" || context === "googleLogin" || context === "googleSignup") {
        return "We couldn't reach the sign-in service. Check your connection and try again.";
    }

    return "We couldn't reach SpaceRead. Check your connection and try again.";
}

function badRequestMessage(context: ApiErrorContext, loginIdentifier?: "email" | "username") {
    switch (context) {
        case "login":
            return loginIdentifier === "email"
                ? "Enter your email and password."
                : "Enter your username and password.";
        case "signup":
            return "Check the highlighted fields and try again.";
        case "googleSignup":
            return "Choose a valid username and try again.";
        case "courseUpload":
            return "This file couldn't be uploaded. Check the file type and name, then try again.";
        default:
            return "Check the information you entered and try again.";
    }
}

function unauthorizedMessage(context: ApiErrorContext, loginIdentifier?: "email" | "username") {
    switch (context) {
        case "login":
            return loginIdentifier === "email"
                ? "That email and password don't match."
                : "That username and password don't match.";
        case "googleLogin":
        case "googleSignup":
            return "Google couldn't verify this sign-in. Try again.";
        case "courseUpload":
            return "Your session expired. Refresh the page, then upload the file again.";
        default:
            return "Please sign in again to continue.";
    }
}

function forbiddenMessage(context: ApiErrorContext) {
    if (context === "courseUpload") {
        return "Refresh the page, then upload the file again.";
    }

    return "Refresh the page, then try again.";
}

function notFoundMessage(context: ApiErrorContext) {
    if (context === "professorLoad") {
        return "We couldn't find that professor.";
    }

    if (context === "courseUpload") {
        return "We couldn't find that course. Refresh the page, then try again.";
    }

    return "We couldn't find what you were looking for.";
}

function conflictMessage(context: ApiErrorContext, code?: ErrorCode) {
    if (code === "email_taken") {
        if (context === "googleSignup") {
            return "An account already uses that Google email. Try signing in with Google again.";
        }

        return "That email is already in use.";
    }

    if (code === "username_taken") {
        return "That username is already taken.";
    }

    if (context === "signup") {
        return "Those account details are already in use.";
    }

    if (context === "googleSignup") {
        return "That username is already taken. Pick another one.";
    }

    return "This has already been submitted.";
}

function tooLargeMessage(context: ApiErrorContext) {
    if (context === "courseUpload") {
        return "This file is too large. Choose a file under 100 MB.";
    }

    return "This file is too large.";
}

function unsupportedTypeMessage(context: ApiErrorContext) {
    if (context === "courseUpload") {
        return "This file type isn't supported for course materials.";
    }

    return "This file type isn't supported.";
}
