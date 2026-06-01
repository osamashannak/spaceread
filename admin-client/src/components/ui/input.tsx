import * as React from "react";
import {cn} from "@/lib/utils";
import styles from "./input.module.scss";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({className, ...props}, ref) => (
        <input ref={ref} className={cn(styles.input, className)} {...props}/>
    ),
);
Input.displayName = "Input";
