import { ReviewFormDraft } from "../../typed/professor.ts";
import styles from "../../styles/components/professor/review_form.module.scss";
import { Dispatch, SetStateAction, useMemo } from "react";

type MediaPick =
    | ({ kind: "gif" } & NonNullable<ReviewFormDraft["gif"]>)
    | ({ kind: "attachment" } & NonNullable<ReviewFormDraft["attachment"]>);

export default function ReviewAttachment(props: {
    details: ReviewFormDraft;
    setDetails: Dispatch<SetStateAction<ReviewFormDraft>>;
}) {
    const { details, setDetails } = props;

    // pick exactly one
    const media: MediaPick | undefined = useMemo(() => {
        if (details.gif) return { kind: "gif", ...details.gif };
        if (details.attachment) return { kind: "attachment", ...details.attachment };
        return undefined;
    }, [details.gif, details.attachment]);

    if (!media) return null;

    const aspectRatio = media.width ? media.height / media.width : 1;

    const handleDelete = () => {
        setDetails((prev) => ({
            ...prev,
            gif: media.kind === "gif" ? undefined : prev.gif,
            attachment: media.kind === "attachment" ? undefined : prev.attachment,
        }));
        try {
            URL.revokeObjectURL(media.url);
        } catch {}
    };

    const key = media.kind === "attachment" ? media.id : `gif:${media.url}`;

    return (
        <>
            <div
                key={key}
                className={styles.imagePreview}
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={media.kind === "gif" ? "Remove GIF" : "Remove image"}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256">
                        <path
                            fill="currentColor"
                            d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128L50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"
                        />
                    </svg>
                </button>

                <div style={{ paddingBottom: `${aspectRatio * 100}%` }} />
                <div style={{ backgroundImage: `url(${media.url})` }} className={styles.imageDiv} />
                <img src={media.url} draggable={false} width={100} height={100} alt="" />
            </div>
        </>
    );
}
