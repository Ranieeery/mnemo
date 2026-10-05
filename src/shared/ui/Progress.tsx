import { Progress as Primitive } from "radix-ui";
import { cx } from "../lib/cx";

type ProgressProps = {
    /** `null` shows an indeterminate bar (work started, total unknown). */
    value: number | null;
    max?: number;
    /** Accessible name, e.g. "Processing videos". */
    label: string;
    tone?: "accent" | "success";
    size?: "thin" | "regular";
    className?: string;
};

export function Progress({ value, max = 100, label, tone = "accent", size = "regular", className }: ProgressProps) {
    const percent = value === null || max <= 0 ? null : Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <Primitive.Root
            value={value === null ? null : Math.min(value, max)}
            max={max}
            aria-label={label}
            className={cx(
                "relative w-full overflow-hidden rounded-full bg-surface-hover",
                size === "thin" ? "h-1" : "h-1.5",
                className
            )}
        >
            <Primitive.Indicator
                className={cx(
                    "h-full rounded-full transition-[width] duration-(--duration-base) ease-standard",
                    tone === "success" ? "bg-success" : "bg-accent",
                    percent === null && "w-2/5 animate-indeterminate motion-reduce:w-full motion-reduce:animate-none"
                )}
                style={percent === null ? undefined : { width: `${percent}%` }}
            />
        </Primitive.Root>
    );
}
