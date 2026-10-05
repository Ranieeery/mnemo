import type { ReactNode } from "react";
import { cx } from "../lib/cx";

type KbdProps = {
    children: ReactNode;
    className?: string;
};

/** A keyboard key, as shown in tooltips and shortcut lists. */
export function Kbd({ children, className }: KbdProps) {
    return (
        <kbd
            className={cx(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-badge border border-border-strong",
                "bg-surface px-1 font-sans text-caption font-medium text-text-muted",
                className
            )}
        >
            {children}
        </kbd>
    );
}
