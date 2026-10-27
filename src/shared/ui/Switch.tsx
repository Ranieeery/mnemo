import { Switch as Primitive } from "radix-ui";
import { useId } from "react";
import { cx } from "../lib/cx";
import { forcedKnobClasses, forcedTrackClasses } from "./forcedColors";

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
                    // Off, the track is outlined so it reads on any surface; on, the light accent fills it and the
                    // thumb turns dark to stand out against it.
                    "relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-hover ring-1 ring-control-border ring-inset",
                    "transition-colors duration-(--duration-fast) ease-standard",
                    "data-[state=checked]:bg-accent data-[state=checked]:ring-transparent disabled:opacity-50",
                    // In high contrast, on fills the track with the highlight color, like the accent does.
                    forcedTrackClasses,
                    "forced-colors:data-[state=checked]:bg-[Highlight] forced-colors:data-[state=checked]:outline-[Highlight]"
                )}
            >
                <Primitive.Thumb
                    className={cx(
                        "block size-4 translate-x-0.5 rounded-full bg-text shadow-raised transition-[translate,background-color] duration-(--duration-fast) ease-standard data-[state=checked]:translate-x-4.5 data-[state=checked]:bg-accent-foreground",
                        forcedKnobClasses,
                        "forced-colors:data-[state=checked]:bg-[HighlightText]"
                    )}
                />
            </Primitive.Root>
        </div>
    );
}
