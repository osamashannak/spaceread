import styles from "../../styles/components/course/file_upload.module.scss";
import {formatBytes, getIconFromMIME} from "../../utils.tsx";

export default function FilePreview(props: {
    id: string,
    name: string,
    file: File,
    status: "ready" | "uploading" | "uploaded" | "failed",
    message: string,
    disabled: boolean,
    changeName: (id: string, name: string) => void,
    deleteFile: (id: string) => void
}) {

    const locked = props.disabled || props.status === "uploading" || props.status === "uploaded";


    return (
        <div className={styles.filePreview}>
            <div className={styles.filePreviewIcon}>
                {getIconFromMIME(props.file.type)}
            </div>
            <div className={styles.filePreviewBody}>
                <input
                    type={"text"}
                    onChange={event => {
                        props.changeName(props.id, event.target.value);
                    }}
                    disabled={locked}
                    className={styles.filePreviewName}
                    defaultValue={props.name}
                    aria-label={"File name"}/>
                <div className={styles.filePreviewMeta}>
                    <span>{formatBytes(props.file.size)}</span>
                    <span className={styles.metaDivider}/>
                    <span>{props.message}</span>
                </div>
            </div>
            <div hidden={locked} className={styles.deleteWrapper}>
                <button
                    className={styles.deleteIcon}
                    type={"button"}
                    onClick={() => props.deleteFile(props.id)}
                    aria-label={`Remove ${props.name}`}
                >
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22px" height="22px"
                         viewBox="0 0 24 24">
                        <path fill="currentColor"
                              d="M5 21V6H4V4h5V3h6v1h5v2h-1v15H5Zm2-2h10V6H7v13Zm2-2h2V8H9v9Zm4 0h2V8h-2v9ZM7 6v13V6Z"/>
                    </svg>
                </button>
            </div>

        </div>
    )
}
