import {Helmet} from "@dr.pogodin/react-helmet";
import {SITE_ORIGIN} from "../lib/metadata.ts";

type PageMetadataProps = {
    title: string;
    description: string;
    canonicalPath?: string;
    noIndex?: boolean;
};

export default function PageMetadata({title, description, canonicalPath, noIndex = false}: PageMetadataProps) {
    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description}/>
            {canonicalPath && !noIndex && <link rel="canonical" href={`${SITE_ORIGIN}${canonicalPath}`}/>}
            {noIndex && <meta name="robots" content="noindex, follow"/>}
        </Helmet>
    );
}
