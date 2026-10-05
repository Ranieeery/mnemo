import { Tabs as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
    return <Primitive.List className={cx("flex gap-1 border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
    return (
        <Primitive.Trigger
            className={cx(
                "-mb-px border-b-2 border-transparent px-3 py-2 text-body font-medium text-text-muted",
                "transition-colors duration-(--duration-fast) ease-standard hover:text-text",
                "data-[state=active]:border-accent data-[state=active]:text-text",
                className
            )}
            {...props}
        />
    );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
    return <Primitive.Content className={cx("pt-4 data-[state=active]:animate-appear", className)} {...props} />;
}
