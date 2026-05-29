import styles from "../styles/pages/professor.module.scss";
import SearchBox from "../components/searchbox.tsx";
import UniversitySelector from "../components/professor/university_selector.tsx";
import {createContext, type FormEvent, useEffect, useState} from "react";
import {Helmet} from "@dr.pogodin/react-helmet";
import {prepareProfessorRequest, submitProfessorRequest} from "../api/professor.ts";
import {useToast} from "../components/provider/toast.tsx";

export type GlobalContent = {
    university: string | null,
    setUniversity: (c: string) => void
}
export const UniversityContext = createContext<GlobalContent>({
    setUniversity(_c: string): void {
    }, university: null
});

const universityShortNames: Record<string, string> = {
    "United Arab Emirates University": "UAEU",
    "Khalifa University": "KU",
    "University of Sharjah": "UOS",
};

type ProfessorRequestDraft = {
    professorName: string;
    professorEmail: string;
    college: string;
};

const emptyProfessorRequestDraft: ProfessorRequestDraft = {
    professorName: "",
    professorEmail: "",
    college: "",
};

function optionalValue(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

export default function ProfessorLookup() {

    const selectedUniversity = localStorage.getItem("selectedUniversity");

    const [university, setUniversity] = useState(selectedUniversity);
    const [requestOpen, setRequestOpen] = useState(false);
    const [requestDraft, setRequestDraft] = useState<ProfessorRequestDraft>(emptyProfessorRequestDraft);
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (!university) return;

        localStorage.setItem("selectedUniversity", university);
    }, [university]);

    useEffect(() => {
        if (!requestOpen) return;

        void prepareProfessorRequest();
    }, [requestOpen]);

    const updateRequestDraft = (field: keyof ProfessorRequestDraft, value: string) => {
        setRequestDraft((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const toggleProfessorRequest = () => {
        setRequestOpen((current) => !current);
    };

    const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!university) {
            toast.error("Select a university first.");
            return;
        }

        if (!requestDraft.professorName.trim()) {
            toast.error("Add the professor name.");
            return;
        }

        setRequestSubmitting(true);

        const response = await submitProfessorRequest({
            professor_name: requestDraft.professorName.trim(),
            university,
            professor_email: optionalValue(requestDraft.professorEmail),
            college: optionalValue(requestDraft.college),
        });

        setRequestSubmitting(false);

        if (!response?.success) {
            toast.error("Request failed. Try again in a moment.");
            return;
        }

        setRequestDraft(emptyProfessorRequestDraft);
        setRequestOpen(false);
        toast.success("Request sent. We will add them after checking the details.");
    };

    return (
        <>
            <Helmet>
                <title>Rate a Professor - SpaceRead</title>
            </Helmet>
            <div className={styles.searchPage}>
                <section className={styles.lookupHero}>
                    <div className={styles.heroCopy}>
                        <span className={styles.heroEyebrow}>Professor reviews</span>
                        <h1>Rate a Professor</h1>
                        <p>Find student experiences before registration, then leave yours after class.</p>
                    </div>
                    <div className={styles.heroSignals} aria-label="Professor review highlights">
                        <div className={styles.heroSignal}>
                            <strong>30k+</strong>
                            <span>reviews posted</span>
                        </div>
                        <div className={styles.heroSignal}>
                            <strong>Anonymous</strong>
                            <span>reviews</span>
                        </div>
                        <div className={styles.heroSignal}>
                            <strong>3</strong>
                            <span>universities</span>
                        </div>
                    </div>
                </section>

                <section className={styles.lookupPanel}>
                    <UniversityContext.Provider value={{university, setUniversity}}>
                        <UniversitySelector/>

                        <div className={styles.searchBox}>
                            <div className={styles.searchStepHeader}>
                                <span className={styles.stepBadge}>2</span>
                                <div>
                                    <span>Search professors</span>
                                    <p>{university ? `${universityShortNames[university] ?? university} is selected.` : "Select a university first."}</p>
                                </div>
                            </div>

                            {university ? (
                                <>
                                    <SearchBox
                                        type={"professor"}
                                        placeholder={"Search by professor name or email"}
                                    />
                                </>
                            ) : (
                                <div className={styles.emptySearchState}>
                                    <span>Pick a university to load its professor list.</span>
                                </div>
                            )}
                        </div>
                    </UniversityContext.Provider>
                </section>

                {university && (
                    <section className={styles.professorRequestSection}>
                        <div className={styles.professorRequestInline}>
                            <span>Missing professor?</span>
                            <button
                                type="button"
                                className={styles.professorRequestButton}
                                onClick={toggleProfessorRequest}
                            >
                                {requestOpen ? "Close" : "Request add"}
                            </button>
                        </div>
                        {requestOpen && (
                            <form className={styles.professorRequestForm} onSubmit={handleRequestSubmit}>
                                <input
                                    value={requestDraft.professorName}
                                    onChange={(event) => updateRequestDraft("professorName", event.target.value)}
                                    maxLength={120}
                                    placeholder="Professor name"
                                    aria-label="Professor name"
                                />
                                <input
                                    value={requestDraft.professorEmail}
                                    onChange={(event) => updateRequestDraft("professorEmail", event.target.value)}
                                    maxLength={254}
                                    placeholder="Email (optional)"
                                    aria-label="Professor email"
                                    inputMode="email"
                                />
                                <input
                                    value={requestDraft.college}
                                    onChange={(event) => updateRequestDraft("college", event.target.value)}
                                    maxLength={500}
                                    placeholder="College (optional)"
                                    aria-label="College"
                                />
                                <button
                                    type="submit"
                                    className={styles.professorRequestSubmit}
                                    disabled={requestSubmitting}
                                >
                                    {requestSubmitting ? "Sending..." : "Send"}
                                </button>
                            </form>
                        )}
                    </section>
                )}
            </div>
        </>
    )
}
