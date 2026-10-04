import type {KeyboardEvent} from "react";
import styles from "../../styles/components/professor/review.module.scss";
import {isGifUrl} from "../../utils.tsx";
import {useModal} from "../provider/modal.tsx";
import ImagePreviewModal from "../modal/image_preview_modal.tsx";

export default function ReviewImage(props: {
    url: string;
    width: number;
    height: number;
    mimeType?: string;
    // GIFs are never previewable, whether picked from the GIF search or uploaded as an attachment.
    previewable?: boolean;
}) {
    const modal = useModal();
    // Older attachments may have no file extension, so prefer the stored MIME type when the API provides it.
    const isGif = props.mimeType ? props.mimeType.toLowerCase() === "image/gif" : isGifUrl(props.url);
    const previewable = (props.previewable ?? true) && !isGif;
    const openPreview = () => modal.openModal(ImagePreviewModal, {src: props.url});

    return (
        <div className={styles.imageList}>
            <div
                className={previewable ? styles.attachment : `${styles.attachment} ${styles.nonInteractive}`}
                {...(previewable && {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": "View image",
                    "aria-haspopup": "dialog" as const,
                    onClick: openPreview,
                    onKeyDown: (event: KeyboardEvent) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        openPreview();
                    },
                })}
            >
                <div style={{paddingBottom: `${props.height / props.width * 100}%`}}></div>
                <div style={{backgroundImage: `url(${props.url})`}} className={styles.imageDiv}>
                </div>
                <img src={props.url}
                     draggable={false}
                     width={100}
                     height={100}
                     alt={""}/>
            </div>
        </div>
    );
}
