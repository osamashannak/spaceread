import styles from "../styles/pages/login.module.scss";
import dayjs from "dayjs";
import {CredentialResponse, GoogleLogin, GoogleOAuthProvider} from "@react-oauth/google";
import {useCallback, useEffect, useRef, useState} from "react";
import LoginWithEmail from "../components/login/login_with_email.tsx";
import RegisterForm from "../components/login/register_form.tsx";
import CompleteGoogleSignUp from "../components/login/complete_google_signup.tsx";
import {GoogleSignUpProps} from "../typed/user.ts";
import {sendGoogleLogin} from "../api/auth.ts";
import {Helmet} from "@dr.pogodin/react-helmet";
import {getLoginRedirect} from "../lib/login_redirect.ts";
import {getUserFacingError, getUserFacingResponseError} from "../api/errors.ts";
import {useAppDispatch, useAppSelector} from "../redux/hooks.ts";
import {useNavigate} from "react-router-dom";
import {setUser} from "../redux/slice/user_slice.ts";


export default function Login() {

    const [displayScreen, setDisplayScreen] = useState<"login" | "register" | undefined>();
    const [googleSignUp, setGoogleSignUp] = useState<GoogleSignUpProps | null>(null);
    const [width, setWidth] = useState<number>(getWidth());
    const [googleError, setGoogleError] = useState("");
    const dispatch = useAppDispatch();
    const userStatus = useAppSelector(state => state.user.status);
    const navigate = useNavigate();
    const redirectedRef = useRef(false);

    const completeLoginRedirect = useCallback((defaultRedirect?: string) => {
        if (redirectedRef.current) return;
        redirectedRef.current = true;

        const fallbackRedirect = !defaultRedirect || defaultRedirect === "/" ? "/professor" : defaultRedirect;
        const redirectUrl = new URL(getLoginRedirect(fallbackRedirect), window.location.origin);
        if (redirectUrl.origin !== window.location.origin) {
            window.location.href = redirectUrl.href;
            return;
        }

        navigate(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`, {replace: true});
    }, [navigate]);

    useEffect(() => {
        if (userStatus === "authenticated") {
            completeLoginRedirect();
        }
    }, [completeLoginRedirect, userStatus]);


    function googleSignInSuccess(response: CredentialResponse) {
        if (!response.credential) {
            return;
        }

        const credential = response.credential;
        setGoogleError("");

        sendGoogleLogin(credential).then(async (res) => {
            if (!res || !res.ok) {
                setGoogleError(await getUserFacingResponseError(res, "googleLogin"));
                return;
            }

            const data = await res.json();

            if (data.status === "authenticated") {
                dispatch(setUser(data));
                completeLoginRedirect(data.redirect);
                return;
            }

            setGoogleSignUp({
                email: data.email,
                username: data.suggestedUsername,
                credential
            });

        });

    }

    useEffect(() => {
        window.onresize = () => {
            setWidth(getWidth());
        }

        return () => {
            window.onresize = null;
        }
    }, []);

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

    function getWidth() {
        if (window.innerWidth <= 332) {
            return 290;
        } else if (window.innerWidth <= 415) {
            return window.innerWidth-46;
        } else if (window.innerWidth <= 768) {
            return 370;
        }
        return 400;
    }


    if (userStatus === "authenticated") {
        return null;
    }

    if (userStatus === "loading") {
        return null;
    }

    return (
        <>

            <Helmet>
                <title>Login - SpaceRead</title>
                <meta name={"description"} content={"Login or sign up to SpaceRead."}/>
            </Helmet>

            {
                displayScreen === "register" && <RegisterForm setDisplayScreen={setDisplayScreen} onLoginComplete={completeLoginRedirect}/>
            }

            {
                displayScreen === "login" && <LoginWithEmail setDisplayScreen={setDisplayScreen} onLoginComplete={completeLoginRedirect}/>
            }

            {googleSignUp && <CompleteGoogleSignUp autocomplete={googleSignUp} setDisplayScreen={setDisplayScreen} onLoginComplete={completeLoginRedirect}/>}


            <div className={styles.loginPage}>

                <div className={styles.headSection}>
                    <span className={styles.title}>Choose how you want to continue</span>
                </div>


                <div className={styles.loginForm}>

                    <button className={styles.formButton} onClick={(e) => {
                        e.stopPropagation();
                        setDisplayScreen("login");
                    }}>Login with Email
                    </button>

                    <button className={styles.signUpButton} onClick={(e) => {
                        e.stopPropagation();
                        setDisplayScreen("register");
                    }}>Create Account
                    </button>

                    <div className={styles.orSeparator}>
                        <span>OR</span>
                    </div>

                    <div className={styles.loginWith}>

                        <GoogleOAuthProvider clientId={googleClientId}>
                            <GoogleLogin
                                width={width}
                                type={"standard"}
                                theme={"outline"}
                                size={"large"}
                                text={"continue_with"}
                                shape={"pill"}
                                ux_mode={"popup"}
                                useOneTap={false}
                                locale={dayjs.locale()}
                                use_fedcm_for_prompt
                                itp_support
                                onSuccess={googleSignInSuccess}
                                onError={() => setGoogleError(getUserFacingError(undefined, "googleLogin"))}/>
                        </GoogleOAuthProvider>
                    </div>

                    {googleError && <div className={styles.validation} role={"alert"}>{googleError}</div>}

                    <p className={styles.terms}>
                        By continuing, you agree to our <a href={"/terms-of-service"}>Terms of Service</a> and <a
                        href={"/privacy"}>Privacy Policy</a>.
                    </p>


                </div>

            </div>
        </>
    )

}
