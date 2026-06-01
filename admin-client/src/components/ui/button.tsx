import * as React from "react";
import {Slot} from "@radix-ui/react-slot";
import {cva, type VariantProps} from "class-variance-authority";
import {cn} from "@/lib/utils";
import styles from "./button.module.scss";

const buttonVariants = cva(
    styles.button,
    {
        variants: {
            variant: {
                default: styles.default,
                secondary: styles.secondary,
                ghost: styles.ghost,
                outline: styles.outline,
                destructive: styles.destructive,
            },
            size: {
                default: "",
                sm: styles.sm,
                icon: styles.icon,
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({className, variant, size, asChild = false, ...props}, ref) => {
        const Comp = asChild ? Slot : "button";
        return <Comp className={cn(buttonVariants({variant, size, className}))} ref={ref} {...props}/>;
    },
);
Button.displayName = "Button";
