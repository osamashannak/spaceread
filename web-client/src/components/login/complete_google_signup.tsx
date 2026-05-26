import styles from "../../styles/pages/login.module.scss";
import {GoogleSignUpProps} from "../../typed/user.ts";
import {FormEvent, useEffect, useState} from "react";
import {sendGoogleSignup} from "../../api/auth.ts";
import {isUsernameValid} from "../../utils.tsx";
import CenterScreen from "../center_screen.tsx";
import {getUserFacingResponseError} from "../../api/errors.ts";
import {useAppDispatch} from "../../redux/hooks.ts";
import {setUser} from "../../redux/slice/user_slice.ts";


export default function CompleteGoogleSignUp({autocomplete, setDisplayScreen, onLoginComplete}: {
    autocomplete: GoogleSignUpProps,
    setDisplayScreen: (screen: "login" | "register" | undefined) => void,
    onLoginComplete: (redirect?: string) => void
}) {

    const dispatch = useAppDispatch();
    const [form, setForm] = useState(autocomplete);
    const [failedAttempt, setFailedAttempt] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");

    useEffect(() => {
        setFailedAttempt(false);
    }, [form]);

    function formSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const validation = document.querySelector(`#google-signup-form`) as HTMLDivElement;
        validation.innerText = "";

        const button = document.querySelector(`.${styles.formButton}`) as HTMLButtonElement;
        button.disabled = true;
        button.classList.add(styles.disabledButton);

        sendGoogleSignup(form.credential, form.username).then(async (res) => {

            if (!res || res.status !== 200) {
                validation.innerText = await getUserFacingResponseError(res, "googleSignup");

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
        return !failedAttempt && isUsernameValid(form.username) === true;
    }

    return (
        <CenterScreen setDisplayScreen={setDisplayScreen}>

                <div className={styles.panelTitle}>
                    <h2>Complete Sign Up</h2>
                    <p>Sign up with Google</p>
                </div>


                <form onSubmit={formSubmit}>
                    <div className={styles.loginForm}>
                        <span>Email</span>
                        <input type={"email"} value={autocomplete.email} disabled required placeholder={"Email"}
                               className={styles.formField}/>
                        <span>Pick a username</span>
                        <input type={"text"}
                               onChange={(e) => {
                                   setForm({...form, username: e.target.value});
                               }}
                               onBlur={(e) => {
                                   const username = e.target.value;

                                   const usernameValidation = isUsernameValid(username);

                                   if (typeof usernameValidation === "string") {
                                       setValidationMessage(usernameValidation);
                                       e.target.classList.add(styles.invalid);
                                   } else {
                                       setValidationMessage("");
                                       e.target.classList.remove(styles.invalid);
                                   }

                               }}
                               defaultValue={autocomplete.username} required
                               className={styles.formField}/>
                        <div id={"google-signup-form"} className={styles.validation}>
                            <p>{validationMessage}</p>
                        </div>

                    </div>

                    <div>
                        <button type={"submit"} className={canSubmit() ? styles.formButton : styles.disabledButton}>Sign
                            Up
                        </button>
                    </div>
                </form>

        </CenterScreen>
    )
}
