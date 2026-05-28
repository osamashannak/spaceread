import {MySpaceAPI} from "../typed/my_space.ts";

const HOST = import.meta.env.VITE_AUTH_ENDPOINT;

export type MySpaceResult =
    | { status: "ok"; data: MySpaceAPI }
    | { status: "unauthorized" }
    | { status: "error" };

export async function getMySpace(): Promise<MySpaceResult> {
    try {
        const response = await fetch(HOST + "/gate/my-space", {
            credentials: "include",
            cache: "no-cache"
        });

        if (response.status === 401) return {status: "unauthorized"};
        if (!response.ok) return {status: "error"};

        return {status: "ok", data: await response.json() as MySpaceAPI};
    } catch {
        return {status: "error"};
    }
}
