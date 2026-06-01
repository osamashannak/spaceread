import * as React from "react";
import {cn} from "@/lib/utils";
import styles from "./card.module.scss";

export function Card({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn(styles.card, className)} {...props}/>;
}

export function CardHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn(styles.header, className)} {...props}/>;
}

export function CardTitle({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={cn(styles.title, className)} {...props}/>;
}

export function CardDescription({className, ...props}: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn(styles.description, className)} {...props}/>;
}

export function CardContent({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn(styles.content, className)} {...props}/>;
}
