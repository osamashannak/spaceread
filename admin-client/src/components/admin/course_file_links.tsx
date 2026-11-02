import {useState} from "react";
import {Download, Eye} from "lucide-react";
import {Button} from "@/components/ui/button";
import {getAdminCourseFileLink} from "@/lib/admin_api";

// Must match coursefile.PreviewContentType on the server.
const PREVIEWABLE_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
]);

export function canPreviewCourseFile(type: string) {
    return PREVIEWABLE_TYPES.has(type.split(";", 1)[0].trim().toLowerCase());
}

type Mode = "preview" | "download";

/**
 * Preview opens PDFs, images, audio and video in a new tab, where the browser
 * renders them in its sandbox. Download always saves the file instead of opening it.
 */
export function CourseFileLinks({file}: { file: { id: string | number; type: string } }) {
    const [pending, setPending] = useState<Mode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const previewable = canPreviewCourseFile(file.type);

    const open = async (mode: Mode) => {
        setError(null);
        setPending(mode);
        // Open the tab during the click so popup blockers allow it, then point it at the signed link.
        const tab = mode === "preview" ? window.open("about:blank", "_blank") : null;
        try {
            const {url} = await getAdminCourseFileLink(String(file.id), mode);
            if (mode === "preview" && tab) {
                tab.opener = null;
                tab.location.replace(url);
            } else {
                window.location.assign(url);
            }
        } catch (err) {
            tab?.close();
            setError(err instanceof Error ? err.message : "Could not create file link");
        } finally {
            setPending(null);
        }
    };

    return (
        <>
            {previewable && (
                <Button disabled={pending !== null} size="sm" type="button" variant="outline" onClick={() => open("preview")}>
                    <Eye size={15}/>
                    {pending === "preview" ? "Opening…" : "Preview"}
                </Button>
            )}
            <Button disabled={pending !== null} size="sm" type="button" variant="outline" onClick={() => open("download")}>
                <Download size={15}/>
                {pending === "download" ? "Preparing…" : "Download"}
            </Button>
            {error && <span role="alert">{error}</span>}
        </>
    );
}
