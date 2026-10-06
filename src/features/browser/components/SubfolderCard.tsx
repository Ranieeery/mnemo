import { Link } from "@tanstack/react-router";
import { CircleCheck, Folder } from "lucide-react";
import type { ComponentProps } from "react";
import type { SubfolderEntry } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { Progress } from "../../../shared/ui";

type SubfolderCardProps = Omit<ComponentProps<"a">, "href" | "children"> & {
    folder: SubfolderEntry;
};

/**
 * A subfolder with its progress. Fully watched folders are marked so the remaining ones stand out. Extra props and the
 * ref reach the link, so it can be the trigger of a context menu.
 */
export function SubfolderCard({ folder, className, ...props }: SubfolderCardProps) {
    const { totalVideos, watchedVideos } = folder.stats;
    const complete = totalVideos > 0 && watchedVideos === totalVideos;
    const percent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

    return (
        <Link
            to="/folder"
            search={{ path: folder.path }}
            className={cx(
                "flex flex-col gap-3 rounded-card border border-border bg-surface p-4",
                "transition-colors duration-(--duration-fast) ease-standard hover:border-border-strong hover:bg-surface-raised",
                className
            )}
            {...props}
        >
            <div className="flex items-center gap-2.5">
                {complete ? (
                    <CircleCheck className="size-5 shrink-0 text-success" aria-label="Fully watched" />
                ) : (
                    <Folder className="size-5 shrink-0 text-text-muted" aria-hidden />
                )}
                <span className="min-w-0 truncate text-body font-medium text-text" title={folder.name}>
                    {folder.name}
                </span>
            </div>
            {totalVideos > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-small text-text-muted tabular-nums">
                        {watchedVideos} of {totalVideos} watched
                        <span className="text-text-subtle">, {percent}%</span>
                    </span>
                    <Progress
                        label={`${folder.name} progress`}
                        value={watchedVideos}
                        max={totalVideos}
                        size="thin"
                        tone={complete ? "success" : "accent"}
                    />
                </div>
            ) : (
                <span className="text-small text-text-subtle">No videos read yet</span>
            )}
        </Link>
    );
}
