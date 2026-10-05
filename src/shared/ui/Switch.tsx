import { Switch as Primitive } from "radix-ui";
import { useId } from "react";
import { cx } from "../lib/cx";

type SwitchProps = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
    className?: string;
};

export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
    const id = useId();
    return (
        <div className={cx("flex items-start justify-between gap-4", className)}>
            <div className="flex flex-col gap-0.5">
                <label htmlFor={id} className="text-body font-medium text-text">
                    {label}
                </label>
                {description && (
                    <p id={`${id}-description`} className="text-small text-text-muted">
                        {description}
                    </p>
                )}
            </div>
            <Primitive.Root
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-describedby={description ? `${id}-description` : undefined}
                className={cx(
                    "relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-hover transition-colors",
                    "duration-(--duration-fast) ease-standard data-[state=checked]:bg-accent disabled:opacity-50"
                )}
            >
                <Primitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-text shadow-raised transition-transform duration-(--duration-fast) ease-standard data-[state=checked]:translate-x-4.5" />
            </Primitive.Root>
        </div>
    );
}
