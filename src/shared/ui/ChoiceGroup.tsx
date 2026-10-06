import type { CSSProperties } from "react";
import { Button } from "./Button";

type ChoiceGroupProps<T extends string> = {
    /** Names the group for screen readers. */
    label: string;
    value: T;
    options: readonly { value: T; label: string; style?: CSSProperties }[];
    onChange: (value: T) => void;
};

/** A row of buttons where exactly one is chosen, for a few short options (like the History page's Days/Weeks). */
export function ChoiceGroup<T extends string>({ label, value, options, onChange }: ChoiceGroupProps<T>) {
    return (
        <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">{label}</legend>
            {options.map((option) => (
                <Button
                    key={option.value}
                    size="sm"
                    variant={option.value === value ? "secondary" : "ghost"}
                    aria-pressed={option.value === value}
                    style={option.style}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </Button>
            ))}
        </fieldset>
    );
}
