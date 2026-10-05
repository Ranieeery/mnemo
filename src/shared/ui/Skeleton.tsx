import { cx } from "../lib/cx";

type SkeletonProps = {
    /** Size and shape of the content it stands for, so nothing shifts when it loads. */
    className?: string;
};

/** Placeholder for content that is loading. Hidden from assistive technology; announce loading on the container. */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            aria-hidden
            className={cx("animate-pulse-soft rounded-control bg-surface-raised motion-reduce:animate-none", className)}
        />
    );
}
