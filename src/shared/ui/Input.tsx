import { type ComponentProps, useId } from "react";
import { cx } from "../lib/cx";

export const inputClasses = cx(
    "h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-text",
    "placeholder:text-text-subtle transition-colors duration-(--duration-fast) ease-standard",
    "hover:border-border-strong focus-visible:border-focus-ring disabled:opacity-50",
    "aria-[invalid=true]:border-danger"
);

type InputProps = ComponentProps<"input"> & {
    label: string;
    /** Hide the label visually when the context already makes it obvious (it stays available to screen readers). */
    hideLabel?: boolean;
    hint?: string;
    error?: string;
};

export function Input({ label, hideLabel = false, hint, error, id, className, ...props }: InputProps) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const message = error ?? hint;

    return (
        <div className={cx("flex flex-col gap-1.5", className)}>
            <label htmlFor={inputId} className={cx("text-small font-medium text-text", hideLabel && "sr-only")}>
                {label}
            </label>
            <input
                id={inputId}
                aria-invalid={error ? true : undefined}
                aria-describedby={message ? hintId : undefined}
                className={inputClasses}
                {...props}
            />
            {message && (
                <p id={hintId} className={cx("text-caption", error ? "text-danger" : "text-text-muted")}>
                    {message}
                </p>
            )}
        </div>
    );
}
