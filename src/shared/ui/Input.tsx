import { type ComponentProps, useId } from "react";
import { cx } from "../lib/cx";

/**
 * Focus of a text field: one 2px edge in the accent, inside the field, instead of the page's ring around it. The ring
 * stays as a transparent outline, which Windows high contrast mode paints, since it drops the colored edge.
 */
export const fieldFocusClasses =
    "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-hidden";

export const inputClasses = cx(
    "h-9 w-full rounded-control border border-control-border bg-surface px-3 text-body text-text",
    "placeholder:text-text-subtle transition-colors duration-(--duration-fast) ease-standard",
    "hover:border-text-subtle disabled:opacity-50",
    fieldFocusClasses,
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
                // The webview's autofill would offer past entries (tag names, titles) as if this were a web form.
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={message ? hintId : undefined}
                className={inputClasses}
                {...props}
            />
            {message && (
                <p id={hintId} className={cx("text-caption", error ? "text-danger-text" : "text-text-muted")}>
                    {message}
                </p>
            )}
        </div>
    );
}
