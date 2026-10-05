import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Tooltip } from "./Tooltip";

type IconButtonVariant = "ghost" | "secondary" | "overlay";
type IconButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<IconButtonVariant, string> = {
    ghost: "text-text-muted hover:bg-surface-hover hover:text-text",
    secondary: "border border-border bg-surface-raised text-text hover:bg-surface-hover",
    // For controls drawn over video: no fill until hovered.
    overlay: "text-text hover:bg-surface-hover/60",
};

const sizeClasses: Record<IconButtonSize, string> = {
    sm: "size-7 [&_svg]:size-4",
    md: "size-9 [&_svg]:size-5",
    lg: "size-11 [&_svg]:size-6",
};

type IconButtonProps = Omit<ComponentProps<"button">, "children"> & {
    /** Accessible name, also shown as the tooltip. Required because the button has no visible text. */
    label: string;
    icon: ReactNode;
    shortcut?: string;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    tooltipSide?: "top" | "right" | "bottom" | "left";
    /** Toggle buttons (mute, subtitles) report their state with `aria-pressed`. */
    pressed?: boolean;
};

export function IconButton({
    label,
    icon,
    shortcut,
    variant = "ghost",
    size = "md",
    tooltipSide,
    pressed,
    className,
    type = "button",
    ...props
}: IconButtonProps) {
    return (
        <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
            <button
                type={type}
                aria-label={label}
                aria-pressed={pressed}
                className={cx(
                    "inline-flex shrink-0 items-center justify-center rounded-control",
                    "transition-colors duration-(--duration-fast) ease-standard",
                    "disabled:pointer-events-none disabled:opacity-40",
                    variantClasses[variant],
                    sizeClasses[size],
                    pressed && "text-text",
                    className
                )}
                {...props}
            >
                {icon}
            </button>
        </Tooltip>
    );
}
