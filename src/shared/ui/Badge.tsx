import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
    neutral: "bg-surface-hover text-text-muted",
    accent: "bg-accent text-accent-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    danger: "bg-danger text-danger-foreground",
};

type BadgeProps = {
    tone?: BadgeTone;
    icon?: ReactNode;
    children?: ReactNode;
    className?: string;
};

/** A short status marker (watched, duration, "not processed"). */
export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
    return (
        <span
            className={cx(
                "inline-flex h-5 items-center gap-1 rounded-badge px-1.5 text-caption font-medium tabular-nums",
                "[&_svg]:size-3 [&_svg]:shrink-0",
                toneClasses[tone],
                className
            )}
        >
            {icon}
            {children}
        </span>
    );
}

type TagProps = {
    children: string;
    /** When given, the tag shows a remove button labelled "Remove tag <name>". */
    onRemove?: () => void;
    /**
     * `outline` (default) for tags on a raised surface such as a dialog; `filled` for tags on a `surface` block, where
     * an outline in the same color as the block would be all that shows.
     */
    tone?: "outline" | "filled";
    className?: string;
};

/** A user-defined label attached to a video. */
export function Tag({ children, onRemove, tone = "outline", className }: TagProps) {
    return (
        <span
            className={cx(
                "inline-flex items-center gap-1 rounded-full border pr-1 pl-2.5 text-small text-text",
                // The filled tag keeps a transparent edge, which Windows high contrast mode draws.
                tone === "filled" ? "h-6.5 border-transparent bg-surface-raised" : "h-6 border-border bg-surface",
                !onRemove && "pr-2.5",
                className
            )}
        >
            {children}
            {onRemove && (
                <button
                    type="button"
                    aria-label={`Remove tag ${children}`}
                    onClick={onRemove}
                    className="flex size-4 items-center justify-center rounded-full text-text-subtle hover:bg-surface-hover hover:text-text"
                >
                    <X className="size-3" aria-hidden />
                </button>
            )}
        </span>
    );
}
