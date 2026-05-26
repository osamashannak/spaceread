
import {AuthUser} from "../typed/user.ts";
import {csrfHeader} from "./csrf.ts";

const HOST = import.meta.env.VITE_AUTH_ENDPOINT;

export async function sendLoginRequest(id: string, password: string) {
    let response;

    try {
        response = await fetch(HOST + "/gate/login", {
            method: "POST",
            body: JSON.stringify({id: id, password: password}),
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    return response;
}

export async function sendSignUpRequest(id: string, email: string, password: string) {
    let response;

    try {
        response = await fetch(HOST + "/gate/signup", {
            method: "POST",
            body: JSON.stringify({username: id, email, password}),
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    return response;
}

export async function sendGoogleLogin(credential: string) {
    let response;

    try {
        response = await fetch(HOST + "/gate/googleLogin", {
            method: "POST",
            body: JSON.stringify({credential}),
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    return response;
}

export async function sendGoogleSignup(credential: string, username: string) {
    let response;

    try {
        response = await fetch(HOST + "/gate/googleSignup", {
            method: "POST",
            body: JSON.stringify({credential, username}),
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    return response;
}

export async function getAccountSettings() {
    let response;

    try {
        response = await fetch(HOST + "/gate/account/settings", {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    if (!response || !response.ok) return undefined;
    return await response.json() as AuthUser;
}

export async function logout() {
    let response;

    try {
        response = await fetch(HOST + "/gate/logout", {
            method: "POST",
            headers: csrfHeader(),
            credentials: "include"
        })
    } catch (error) {
        return undefined;
    }

    return response;
}