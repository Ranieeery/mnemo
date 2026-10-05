import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";

type EmptyStateProps = {
    icon: LucideIcon;
    title: string;
    /** What the person can do next. */
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
            <Icon className="size-8 text-text-subtle" strokeWidth={1.5} aria-hidden />
            <div className="flex max-w-sm flex-col gap-1">
                <h2 className="text-title font-semibold text-text">{title}</h2>
                {description && <p className="text-body text-text-muted">{description}</p>}
            </div>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
