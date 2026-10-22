import { Check } from "lucide-react";
import { cx } from "../lib/cx";
import { Tooltip } from "./Tooltip";
import { useRovingFocus } from "./useRovingFocus";

export type ColorSwatch<T extends string> = {
    value: T;
    /** Accessible name and tooltip, e.g. "Teal". */
    label: string;
    /** CSS color of the swatch, usually a token: `var(--color-folder-teal)`. */
    color: string;
};

type ColorSwatchesProps<T extends string> = {
    /** Names the group for screen readers. */
    label: string;
    value: T;
    options: readonly ColorSwatch<T>[];
    onChange: (value: T) => void;
    /** Background behind the group, so the selection ring keeps a gap of it: `ring-offset-surface-raised`. */
    ringOffsetClassName?: string;
};

/**
 * A row of color swatches where exactly one is chosen. It behaves like a radio group: one tab stop (the chosen
 * swatch), arrow keys move and choose, Home and End jump to the ends. The chosen swatch shows a ring and a check, so
 * it never depends on color alone.
 */
export function ColorSwatches<T extends string>({
    label,
    value,
    options,
    onChange,
    ringOffsetClassName = "ring-offset-surface",
}: ColorSwatchesProps<T>) {
    const selectedIndex = Math.max(
        0,
        options.findIndex((option) => option.value === value)
    );

    const choose = (index: number) => {
        const option = options[index];
        if (option) {
            onChange(option.value);
        }
    };
    const { onKeyDown, itemProps } = useRovingFocus({
        count: options.length,
        activeIndex: selectedIndex,
        onMove: choose,
    });

    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
            {options.map((option, index) => {
                const selected = index === selectedIndex && option.value === value;
                return (
                    <Tooltip key={option.value} content={option.label}>
                        {/* biome-ignore lint/a11y/useSemanticElements: color swatches read better as buttons than radio inputs. */}
                        <button
                            {...itemProps(index)}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={option.label}
                            onClick={() => choose(index)}
                            className={cx(
                                "flex size-7 items-center justify-center rounded-full border border-border-strong",
                                "transition-shadow duration-(--duration-fast) ease-standard",
                                selected && "ring-2 ring-accent ring-offset-2",
                                selected && ringOffsetClassName
                            )}
                            style={{ backgroundColor: option.color }}
                        >
                            {/* The app's background color reads on every swatch, which are light on a dark theme. */}
                            {selected && <Check className="size-4 text-background" strokeWidth={3} aria-hidden />}
                        </button>
                    </Tooltip>
                );
            })}
        </div>
    );
}
