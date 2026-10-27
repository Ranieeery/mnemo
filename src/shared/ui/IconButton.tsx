import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Tooltip } from "./Tooltip";

type IconButtonVariant = "ghost" | "secondary" | "overlay";
type IconButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<IconButtonVariant, { base: string; hover: string }> = {
    ghost: { base: "text-text-muted", hover: "hover:bg-surface-hover hover:text-text" },
    secondary: { base: "border border-transparent bg-surface-raised text-text", hover: "hover:bg-surface-hover" },
    // For controls drawn over video: no fill until hovered.
    overlay: { base: "text-text", hover: "hover:bg-surface-hover/60" },
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

function preventDefault(event: MouseEvent) {
    event.preventDefault();
}

/**
 * A button with only an icon, named by its tooltip. Disabled, it stays focusable and hoverable (`aria-disabled`), so
 * the tooltip, often the only place that says why ("No subtitles for this video"), can still be read; it just does
 * nothing, not even when it opens a menu.
 */
export function IconButton({
    label,
    icon,
    shortcut,
    variant = "ghost",
    size = "md",
    tooltipSide,
    pressed,
    disabled = false,
    onClick,
    onPointerDown,
    onKeyDown,
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
                aria-disabled={disabled || undefined}
                // Menu triggers open on pointer down and on keys, so those are dropped too; preventing the click
                // also keeps a submit button from sending its form.
                onClick={disabled ? preventDefault : onClick}
                onPointerDown={disabled ? undefined : onPointerDown}
                onKeyDown={disabled ? undefined : onKeyDown}
                className={cx(
                    "inline-flex shrink-0 items-center justify-center rounded-control",
                    "transition-colors duration-(--duration-fast) ease-standard",
                    variantClasses[variant].base,
                    disabled ? "cursor-default opacity-40" : variantClasses[variant].hover,
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
