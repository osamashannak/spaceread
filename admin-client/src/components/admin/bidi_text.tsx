import {type ComponentPropsWithoutRef} from "react";
import {cn} from "@/lib/utils";
import styles from "./bidi_text.module.scss";

type BidiParagraphProps = ComponentPropsWithoutRef<"p">;
type BidiSpanProps = ComponentPropsWithoutRef<"span">;

export function BidiParagraph({className, dir = "auto", ...props}: BidiParagraphProps) {
    return <p {...props} className={cn(styles.bidiText, className)} dir={dir}/>;
}

export function BidiSpan({className, dir = "auto", ...props}: BidiSpanProps) {
    return <span {...props} className={cn(styles.bidiText, className)} dir={dir}/>;
}
