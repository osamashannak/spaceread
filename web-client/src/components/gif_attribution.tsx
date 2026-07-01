import type {GifPreview} from "../typed/professor.ts";
import styles from "../styles/components/global/gif_attribution.module.scss";

type GifProvider = NonNullable<GifPreview["provider"]>;

export default function GifAttribution(props: {
    provider?: GifProvider;
    url?: string;
}) {
    const provider = props.provider ?? detectGifProvider(props.url);

    if (provider === "tenor") {
        return (
            <a className={styles.attribution} href="https://tenor.com/" rel="noreferrer" target="_blank">
                Via Tenor
            </a>
        );
    }

    return null;
}

function detectGifProvider(url: string | undefined): GifProvider | undefined {
    if (!url) return undefined;

    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (hostname === "media.tenor.com") return "tenor";
    } catch {
        return undefined;
    }

    return undefined;
}
