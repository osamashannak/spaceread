import {ChangeEvent, DragEvent, FormEvent, useRef, useState} from "react";
import styles from "../../styles/components/course/file_upload.module.scss";
import FilePreview from "./file_preview.tsx";
import {uploadFile} from "../../api/course.ts";
import {useToast} from "../provider/toast.tsx";

type UploadStatus = "ready" | "uploading" | "uploaded" | "failed";

type UploadDetails = {
    id: string;
    name: string;
    file: File;
    status: UploadStatus;
    message: string;
}

const readyMessage = "Ready to upload";

export default function FileUpload(props: { courseTag: string }) {
    const nextFileId = useRef(0);
    const toast = useToast();
    const [details, setDetails] = useState<UploadDetails[]>([]);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [hasUploadError, setHasUploadError] = useState(false);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [dragging, setDragging] = useState<boolean>(false);

    const uploadableCount = details.filter(value => value.status !== "uploaded").length;
    const uploadSucceeded = uploadComplete && !hasUploadError;
    const canChooseFiles = !submitting && !uploadSucceeded;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        // @ts-expect-error Clarity is not defined
        clarity("set", "FilesUpload", "true");
        event.preventDefault();
        const uploadTargets = details.filter(value => value.status !== "uploaded");
        if (uploadTargets.length < 1) {
            toast.error("Select at least one file before uploading.");
            return;
        }
        setHasUploadError(false);
        setUploadComplete(false);
        setSubmitting(true);

        setDetails((prevState) => {
            return prevState.map(value => {
                if (value.status === "uploaded") return value;

                return {
                    ...value,
                    status: "uploading",
                    message: "Uploading..."
                };
            });
        });

        const results = await Promise.all(uploadTargets.map(async (value) => {
            try {
                const result = await uploadFile(value.name, value.file, props.courseTag);
                return {
                    id: value.id,
                    ok: result.ok,
                    message: result.ok ? "Uploaded" : result.message
                };
            } catch {
                return {
                    id: value.id,
                    ok: false,
                    message: "Upload failed. Please try again."
                };
            }
        }));

        const hasError = results.some(value => !value.ok);
        const resultById = new Map(results.map(value => [value.id, value]));

        setDetails((prevState) => {
            return prevState.map(value => {
                const result = resultById.get(value.id);
                if (!result) return value;

                return {
                    ...value,
                    status: result.ok ? "uploaded" : "failed",
                    message: result.message
                };
            });
        });
        setHasUploadError(hasError);
        setUploadComplete(true);
        setSubmitting(false);

        if (hasError) {
            toast.error("Some files could not be uploaded. Check the file messages and try again.");
        } else {
            toast.success("Files uploaded. They will appear after review.");
        }
    }

    const changeName = (id: string, name: string) => {
        setDetails((prevState) => {
            const tempState = [...prevState];
            const index = tempState.findIndex(value => value.id === id);
            if (index === -1) return tempState;
            tempState[index].name = name;
            return tempState;
        });
    }

    const deleteFile = (id: string) => {
        setDetails((prevState) => {
            const tempState = [...prevState]
            return tempState.filter(value => value.id !== id);
        });
        setHasUploadError(false);
        setUploadComplete(false);
    }

    const addFiles = (files: File[]) => {
        if (files.length === 0 || !canChooseFiles) return;

        if (details.length >= 10) {
            toast.error("You can upload up to 10 files at a time.");
            return;
        }

        const fileDetails = details.slice();
        const skipped: string[] = [];
        let skippedForLimit = 0;

        files.forEach((file) => {
            if (fileDetails.length >= 10) {
                skippedForLimit++;
                return;
            }

            if (file.size > (100 * 1024 * 1024)) {
                skipped.push(file.name);
                return;
            }

            if (fileDetails.find(value => value.name === file.name)) {
                fileDetails.push({
                    id: `${file.lastModified}-${file.size}-${nextFileId.current++}`,
                    name: `${Math.round(Math.random() * 1E4)}-${file.name}`,
                    file: file,
                    status: "ready",
                    message: readyMessage
                });
            } else {
                fileDetails.push({
                    id: `${file.lastModified}-${file.size}-${nextFileId.current++}`,
                    name: file.name,
                    file: file,
                    status: "ready",
                    message: readyMessage
                });
            }
        });

        setDetails(fileDetails);
        setHasUploadError(false);
        setUploadComplete(false);

        const notices = [];
        if (skipped.length > 0) {
            notices.push(`${skipped.length} ${skipped.length === 1 ? "file was" : "files were"} over 100 MB and not added.`);
        }
        if (skippedForLimit > 0) {
            notices.push(`${skippedForLimit} ${skippedForLimit === 1 ? "file was" : "files were"} not added because the limit is 10 files.`);
        }

        if (notices.length > 0) {
            toast.error(notices.join(" "));
        }
    }

    const onFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || !canChooseFiles) return;

        addFiles(Array.from(event.target.files));

        // @ts-ignore
        event.target.value = null;
    }

    const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        if (!submitting) setDragging(true);
    }

    const onDragLeave = () => {
        setDragging(false);
    }

    const onDrop = (event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setDragging(false);

        if (submitting) return;

        addFiles(Array.from(event.dataTransfer.files));
    }

    const submitLabel = uploadableCount === 0
        ? "Select files first"
        : uploadableCount === 1
            ? "Upload 1 file"
            : `Upload ${uploadableCount} files`;

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <h2>Upload Materials</h2>
            <fieldset style={{border: "none", padding: 0}}>

                <input type={"file"}
                       title={""}
                       className={styles.uploadButtonHTML}
                       id={"file-upload"}
                       disabled={!canChooseFiles}
                       multiple
                       onChange={onFileSelect}/>
                <label
                    className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`}
                    hidden={!canChooseFiles}
                    htmlFor={"file-upload"}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    <span className={styles.dropZoneIcon} aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">
                            <path fill="currentColor"
                                  d="M12 3a5.5 5.5 0 0 1 5.3 4.05A5.5 5.5 0 0 1 17.5 18H15a1 1 0 1 1 0-2h2.5a3.5 3.5 0 0 0 .05-7h-1.81l-.17-.78A3.5 3.5 0 0 0 8.68 8L8.5 9H7a3.5 3.5 0 1 0 0 7h2a1 1 0 1 1 0 2H7A5.5 5.5 0 0 1 6.9 7a5.5 5.5 0 0 1 5.1-4Zm0 8a1 1 0 0 1 .7.29l2.5 2.5a1 1 0 1 1-1.4 1.42L13 14.41V20a1 1 0 1 1-2 0v-5.59l-.8.8a1 1 0 0 1-1.4-1.42l2.5-2.5A1 1 0 0 1 12 11Z"/>
                        </svg>
                    </span>
                    <div className={styles.dropZoneText}>
                        <span>Drag files here or choose files</span>
                        <p>PDFs, images, documents, slides, sheets, or archives.</p>
                    </div>
                    <span className={styles.uploadButtonLabel}>Choose files</span>
                </label>

                <div className={styles.limits}>
                    <span>{details.length}/10 selected</span>
                    <span className={styles.metaDivider}/>
                    <span>Max 100 MB per file</span>
                </div>

                {details.length > 0 && <div className={styles.previewHeader}>Selected files</div>}

                <div className={styles.previewList}>
                    {
                        details.map((value) => {
                            return <FilePreview key={value.id} id={value.id} file={value.file} name={value.name}
                                                status={value.status}
                                                message={value.message}
                                                disabled={submitting}
                                                changeName={changeName}
                                                deleteFile={deleteFile}/>
                        })
                    }
                </div>

                <input hidden={!canChooseFiles}
                       className={uploadableCount >= 1 ? styles.enabledFormSubmit : styles.disabledFormSubmit}
                       disabled={uploadableCount < 1}
                       type={"submit"} title={submitLabel}
                       value={submitLabel}/>

                <div className={styles.disclaimer}>
                    By uploading files, you agree to the <a href={"/terms-of-service"} target={"_blank"}>Terms of Service</a> and <a href={"/privacy"} target={"_blank"}>Privacy Policy</a>.
                </div>

            </fieldset>
        </form>
    )
}
