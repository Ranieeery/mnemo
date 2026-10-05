import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
    secondary: "bg-surface-raised text-text hover:bg-surface-hover border border-border",
    ghost: "text-text-muted hover:bg-surface-hover hover:text-text",
    danger: "bg-danger text-danger-foreground hover:bg-danger-hover",
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: "h-8 gap-1.5 px-3 text-small",
    md: "h-9 gap-2 px-4 text-body",
};

/** Classes shared by every button-like control, so links styled as buttons match. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
    return cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-medium",
        "transition-colors duration-(--duration-fast) ease-standard",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
    );
}

type ButtonProps = ComponentProps<"button"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows a spinner, disables the button and marks it busy while an action runs. */
    loading?: boolean;
    icon?: ReactNode;
};

export function Button({
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    disabled,
    className,
    children,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={buttonClasses(variant, size, className)}
            {...props}
        >
            {loading ? <Spinner /> : icon}
            {children}
        </button>
    );
}
