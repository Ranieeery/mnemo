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
    className,
}: SliderProps) {
    return (
        <Primitive.Root
            value={[value]}
            onValueChange={([next]) => next !== undefined && onValueChange(next)}
            onValueCommit={([next]) => next !== undefined && onValueCommit?.(next)}
            min={min}
            max={max}
            step={step}
            className={cx("relative flex h-5 w-full touch-none select-none items-center", className)}
        >
            <Primitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-hover">
                <Primitive.Range className="absolute h-full bg-accent" />
            </Primitive.Track>
            <Primitive.Thumb
                aria-label={label}
                aria-valuetext={valueText}
                className="block size-3.5 rounded-full bg-text shadow-raised transition-transform duration-(--duration-fast) ease-standard hover:scale-110"
            />
        </Primitive.Root>
    );
}
