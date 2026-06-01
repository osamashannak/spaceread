import * as React from "react";
import {cn} from "@/lib/utils";
import styles from "./table.module.scss";

export function Table({className, ...props}: React.TableHTMLAttributes<HTMLTableElement>) {
    return <table className={cn(styles.table, className)} {...props}/>;
}

export function TableHeader({className, ...props}: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead className={cn(styles.header, className)} {...props}/>;
}

export function TableBody({className, ...props}: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={cn(styles.body, className)} {...props}/>;
}

export function TableRow({className, ...props}: React.HTMLAttributes<HTMLTableRowElement>) {
    return <tr className={cn(styles.row, className)} {...props}/>;
}

export function TableHead({className, ...props}: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return <th className={cn(styles.head, className)} {...props}/>;
}

export function TableCell({className, ...props}: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={cn(styles.cell, className)} {...props}/>;
}
