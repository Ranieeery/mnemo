import { LoaderCircle } from "lucide-react";
import { cx } from "../lib/cx";

type SpinnerProps = {
    className?: string;
    /** Announced to assistive technology; omit when the surrounding control already says it is busy. */
    label?: string;
};

export function Spinner({ className, label }: SpinnerProps) {
    return (
        <LoaderCircle
            className={cx("size-4 shrink-0 animate-spin motion-reduce:animate-none", className)}
            aria-hidden={label ? undefined : true}
            aria-label={label}
            role={label ? "status" : undefined}
        />
    );
}
