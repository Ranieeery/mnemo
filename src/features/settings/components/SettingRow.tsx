import type { ReactNode } from "react";

type SettingRowProps = {
    title: string;
    description: ReactNode;
    /** The control or action, aligned to the end of the row. */
    children: ReactNode;
};

/** A setting or action explained on the left, with its control on the right. */
export function SettingRow({ title, description, children }: SettingRowProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex max-w-xl min-w-0 flex-col gap-0.5">
                <h3 className="text-body font-medium text-text">{title}</h3>
                <div className="text-small text-text-muted">{description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">{children}</div>
        </div>
    );
}
