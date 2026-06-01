import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import {cn} from "@/lib/utils";
import styles from "./tabs.module.scss";

export const Tabs = TabsPrimitive.Root;

export function TabsList({className, ...props}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
    return <TabsPrimitive.List className={cn(styles.list, className)} {...props}/>;
}

export function TabsTrigger({className, ...props}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
    return <TabsPrimitive.Trigger className={cn(styles.trigger, className)} {...props}/>;
}

export function TabsContent({className, ...props}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
    return <TabsPrimitive.Content className={cn(styles.content, className)} {...props}/>;
}
