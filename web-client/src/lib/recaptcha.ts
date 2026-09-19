export const recaptchaDisabled = import.meta.env.VITE_RECAPTCHA_DISABLED === "true";

export type ExecuteRecaptcha = ((action?: string) => Promise<string>) | undefined;

export async function getRecaptchaToken(executeRecaptcha: ExecuteRecaptcha, action: string): Promise<string | undefined> {
    if (recaptchaDisabled) return "dev-recaptcha-bypass";
    if (!executeRecaptcha) return undefined;

    try {
        return await executeRecaptcha(action);
    } catch {
        return undefined;
    }
}

export async function runWithRecaptchaRetry<T>(
    executeRecaptcha: ExecuteRecaptcha,
    action: string,
    operation: (token: string) => Promise<T>,
    shouldRetry: (result: T) => boolean,
): Promise<T | undefined> {
    const token = await getRecaptchaToken(executeRecaptcha, action);
    if (!token) return undefined;

    const result = await operation(token);
    if (!shouldRetry(result)) return result;

    const retryToken = await getRecaptchaToken(executeRecaptcha, action);
    if (!retryToken) return undefined;

    return operation(retryToken);
}
