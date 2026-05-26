
export interface GoogleSignUpProps {
    email: string;
    username: string;
    credential: string;
}

export interface AuthUser {
    status: "guest" | "authenticated";
    id?: string;
    username?: string;
    role?: string;
}
