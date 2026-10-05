import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { Button } from "./Button";

type ErrorStateProps = {
    title: string;
    /** What happened, in terms the person can act on. */
    message?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    /** Extra recovery actions, e.g. a link to install a missing tool. */
    children?: ReactNode;
    className?: string;
};

export function ErrorState({
    title,
    message,
    onRetry,
    retryLabel = "Try again",
    children,
    className,
}: ErrorStateProps) {
    return (
        <div
            role="alert"
            className={cx("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}
        >
            <TriangleAlert className="size-8 text-warning" strokeWidth={1.5} aria-hidden />
            <div className="flex max-w-md flex-col gap-1">
                <h2 className="text-title font-semibold text-text">{title}</h2>
                {message && <div className="text-body break-words text-text-muted">{message}</div>}
            </div>
            {children}
            {onRetry && (
                <Button onClick={onRetry} className="mt-2">
                    {retryLabel}
                </Button>
            )}
        </div>
    );
}
