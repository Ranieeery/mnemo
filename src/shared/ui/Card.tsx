import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

type CardProps = ComponentProps<"div"> & {
    tone?: "surface" | "raised";
};

/** A grouped block of related content (a settings section, a stats panel). Not a wrapper for every item. */
export function Card({ tone = "surface", className, ...props }: CardProps) {
    return (
        <div
            className={cx(
                // The edge comes from the layer; the transparent border only shows in Windows high contrast mode.
                "rounded-card border border-transparent",
                tone === "raised" ? "bg-surface-raised shadow-raised" : "bg-surface",
                className
            )}
            {...props}
        />
    );
}
