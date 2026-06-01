import * as React from "react";
import {cva, type VariantProps} from "class-variance-authority";
import {cn} from "@/lib/utils";
import styles from "./badge.module.scss";

const badgeVariants = cva(styles.badge, {
    variants: {
        variant: {
            default: styles.default,
            success: styles.success,
            warning: styles.warning,
            danger: styles.danger,
            info: styles.info,
            outline: styles.outline,
        },
    },
    defaultVariants: {
        variant: "default",
    },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({className, variant, ...props}: BadgeProps) {
    return <div className={cn(badgeVariants({variant}), className)} {...props}/>;
}
