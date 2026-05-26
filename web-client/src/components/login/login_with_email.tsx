import styles from "../../styles/pages/login.module.scss";
import {FormEvent, useEffect, useState} from "react";
import {sendLoginRequest} from "../../api/auth.ts";
import CenterScreen from "../center_screen.tsx";
import {getLoginError} from "../../api/errors.ts";
import {useAppDispatch} from "../../redux/hooks.ts";
import {setUser} from "../../redux/slice/user_slice.ts";


export default function LoginWithEmail({setDisplayScreen, onLoginComplete}: {
    setDisplayScreen: (screen: "login" | "register" | undefined) => void,
    onLoginComplete: (redirect?: string) => void
}) {

    const dispatch = useAppDispatch();
    const [loginForm, setLoginForm] = useState({
        id: "",
        password: ""
    });
    const [failedAttempt, setFailedAttempt] = useState(false);

    useEffect(() => {
        setFailedAttempt(false);
    }, [loginForm]);

    function formSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const validation = document.querySelector(`#login-form`) as HTMLDivElement;
        validation.innerText = "";

        const button = document.querySelector(`.${styles.formButton}`) as HTMLButtonElement;
        button.disabled = true;
        button.classList.add(styles.disabledButton);

        sendLoginRequest(loginForm.id, loginForm.password).then(async (res) => {

            if (!res || res.status !== 200) {
                validation.innerText = getLoginError(res, loginForm.id);

                button.disabled = false;
                button.classList.remove(styles.disabledButton);
                setFailedAttempt(true);

                return;
            }

            const responseJson = await res.json();
            dispatch(setUser(responseJson));

            onLoginComplete(responseJson.redirect as string | undefined);

        })
    }

    function canSubmit() {
        return !failedAttempt && loginForm.id.length > 0 && loginForm.password.length > 0;
    }

    return (
        <CenterScreen setDisplayScreen={setDisplayScreen}>

            <div className={styles.panelTitle}>
                <h2>Login</h2>
            </div>


            <form onSubmit={formSubmit}>
                <div className={styles.loginForm}>
                    <input type={"text"}
                           onChange={(e) => {
                               setLoginForm({...loginForm, id: e.target.value})
                           }}
                           required
                           autoComplete={"username"}
                           placeholder={"Username or Email"}
                           className={styles.formField}/>
                    <input type={"password"}
                           onChange={(e) => {
                               setLoginForm({...loginForm, password: e.target.value})
                           }}
                           required
                           autoComplete={"current-password"}
                           placeholder={"Password"}
                           className={styles.formField}/>
                    <div id={"login-form"} className={styles.validation}/>

                </div>

                <div>
                    <button type={"submit"}
                            className={canSubmit() ? styles.formButton : styles.disabledButton}>Login
                    </button>
                </div>
            </form>

            <div>
                <a href={"/forgot"}>Forgot Password?</a>
            </div>
        </CenterScreen>
    )

}
