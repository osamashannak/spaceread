export const recaptchaDisabled = import.meta.env.VITE_RECAPTCHA_DISABLED === "true";

export type ExecuteRecaptcha = ((action?: string) => Promise<string>) | undefined;

export async function getRecaptchaToken(executeRecaptcha: ExecuteRecaptcha, action: string): Promise<string | undefined> {
    if (recaptchaDisabled) return "dev-recaptcha-bypass";
    if (!executeRecaptcha) return undefined;
    return executeRecaptcha(action);
}
