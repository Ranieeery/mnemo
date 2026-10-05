import { type ComponentProps, useId } from "react";
import { cx } from "../lib/cx";

type TextareaProps = ComponentProps<"textarea"> & {
    label: string;
    hint?: string;
};

export function Textarea({ label, hint, id, className, ...props }: TextareaProps) {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    return (
        <div className={cx("flex flex-col gap-1.5", className)}>
            <label htmlFor={textareaId} className="text-small font-medium text-text">
                {label}
            </label>
            <textarea
                id={textareaId}
                aria-describedby={hint ? `${textareaId}-hint` : undefined}
                className={cx(
                    "min-h-24 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-body text-text",
                    "placeholder:text-text-subtle transition-colors duration-(--duration-fast) ease-standard",
                    "hover:border-border-strong focus-visible:border-focus-ring"
                )}
                {...props}
            />
            {hint && (
                <p id={`${textareaId}-hint`} className="text-caption text-text-muted">
                    {hint}
                </p>
            )}
        </div>
    );
}
