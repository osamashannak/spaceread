import {useCallback, useEffect, useState, type ReactNode} from "react";
import {LoaderCircle, LogIn, RefreshCw, ShieldAlert} from "lucide-react";
import {Button} from "@/components/ui/button";
import {AdminApiError, getAdminSession, type AdminSessionResponse} from "@/lib/admin_api";
import {adminAuthLostEvent, adminLoginUrl} from "@/lib/admin_auth";
import logo from "@/assets/logo.svg";
import styles from "./admin_access_gate.module.scss";

type GateState =
    | { status: "checking" }
    | { status: "ready"; session: AdminSessionResponse }
    | { status: "unauthenticated" }
    | { status: "forbidden" }
    | { status: "error"; message: string };

export function AdminAccessGate({children}: { children: ReactNode }) {
    const [gate, setGate] = useState<GateState>({status: "checking"});

    const checkAccess = useCallback(async (signal?: AbortSignal) => {
        setGate({status: "checking"});

        try {
            const session = await getAdminSession(signal);
            setGate({status: "ready", session});
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setGate(gateStateFromError(error));
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void checkAccess(controller.signal);
        return () => controller.abort();
    }, [checkAccess]);

    useEffect(() => {
        const onAuthLost = (event: Event) => {
            const status = (event as CustomEvent<{ status?: number }>).detail?.status;
            setGate(status === 403 ? {status: "forbidden"} : {status: "unauthenticated"});
        };

        window.addEventListener(adminAuthLostEvent, onAuthLost);
        return () => window.removeEventListener(adminAuthLostEvent, onAuthLost);
    }, []);

    if (gate.status === "ready") {
        void gate.session;
        return <>{children}</>;
    }

    if (gate.status === "checking") {
        return (
            <AccessScreen
                icon={<LoaderCircle className={styles.spin} size={22}/>}
                title="Checking access"
                message="Confirming your admin session."
            />
        );
    }

    if (gate.status === "unauthenticated") {
        return (
            <AccessScreen
                icon={<LogIn size={22}/>}
                title="Sign in required"
                message="Use an admin account to open SpaceRead Admin."
                actions={(
                    <Button asChild>
                        <a href={adminLoginUrl()}>Sign in</a>
                    </Button>
                )}
            />
        );
    }

    if (gate.status === "forbidden") {
        return (
            <AccessScreen
                icon={<ShieldAlert size={22}/>}
                title="Admin access required"
                message="You are signed in, but this account is not allowed to use the admin panel."
                actions={(
                    <Button asChild variant="outline">
                        <a href={adminLoginUrl()}>Use another account</a>
                    </Button>
                )}
            />
        );
    }

    return (
        <AccessScreen
            icon={<ShieldAlert size={22}/>}
            title="Could not check access"
            message={gate.message}
            actions={(
                <Button type="button" variant="outline" onClick={() => void checkAccess()}>
                    <RefreshCw size={16}/>
                    Try again
                </Button>
            )}
        />
    );
}

function AccessScreen({
    icon,
    title,
    message,
    actions,
}: {
    icon: ReactNode;
    title: string;
    message: string;
    actions?: ReactNode;
}) {
    return (
        <main className={styles.screen}>
            <section className={styles.panel}>
                <div className={styles.brand}>
                    <img src={logo} alt="SpaceRead"/>
                    <div>
                        <strong>SpaceRead</strong>
                        <span>Admin</span>
                    </div>
                </div>
                <div className={styles.icon}>{icon}</div>
                <h1>{title}</h1>
                <p>{message}</p>
                {actions && <div className={styles.actions}>{actions}</div>}
            </section>
        </main>
    );
}

function gateStateFromError(error: unknown): GateState {
    if (error instanceof AdminApiError) {
        if (error.status === 401) return {status: "unauthenticated"};
        if (error.status === 403) return {status: "forbidden"};
        return {status: "error", message: error.message || "Admin API is unavailable."};
    }

    if (error instanceof Error) return {status: "error", message: error.message};
    return {status: "error", message: "Admin API is unavailable."};
}
