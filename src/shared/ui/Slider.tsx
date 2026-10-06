import { Slider as Primitive } from "radix-ui";
import { cx } from "../lib/cx";

type SliderProps = {
    value: number;
    onValueChange: (value: number) => void;
    /** Called once when the user releases the thumb; use it for expensive work like saving. */
    onValueCommit?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Accessible name of the thumb, e.g. "Volume". */
    label: string;
    /** Human-readable value for screen readers, e.g. "40%". */
    valueText?: string;
    /** `compact` is a thinner track with a smaller thumb, for secondary controls like volume. */
    size?: "regular" | "compact";
    disabled?: boolean;
    /** Must set the width (e.g. `w-full`, `w-48`): the slider has no intrinsic size. */
    className?: string;
};

export function Slider({
    value,
    onValueChange,
    onValueCommit,
    min = 0,
    max = 100,
    step = 1,
    label,
    valueText,
    size = "regular",
    disabled = false,
    className,
}: SliderProps) {
    const compact = size === "compact";
    return (
        <Primitive.Root
            value={[value]}
            onValueChange={([next]) => next !== undefined && onValueChange(next)}
            onValueCommit={([next]) => next !== undefined && onValueCommit?.(next)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className={cx(
                "relative flex h-5 touch-none select-none items-center data-[disabled]:opacity-40",
                className
            )}
        >
            <Primitive.Track
                className={cx("relative grow overflow-hidden rounded-full bg-surface-hover", compact ? "h-0.5" : "h-1")}
            >
                <Primitive.Range className="absolute h-full bg-accent" />
            </Primitive.Track>
            <Primitive.Thumb
                aria-label={label}
                aria-valuetext={valueText}
                className={cx(
                    "block rounded-full bg-text shadow-raised transition-transform duration-(--duration-fast) ease-standard hover:scale-110",
                    compact ? "size-3" : "size-3.5"
                )}
            />
        </Primitive.Root>
    );
}
