import { convertFileSrc } from "@tauri-apps/api/core";
import { Film } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cx } from "../lib/cx";
import { formatDuration } from "../lib/formatDuration";

type VideoThumbnailProps = {
    thumbnailPath: string | null;
    durationSeconds?: number;
    /** Fraction watched (0..1); shown as a strip while the video is in progress. */
    progress?: number;
    /** A watched video is dimmed and gets a full strip in the watched color. */
    watched?: boolean;
    /** Drawn over the picture but under the progress strip, so the strip is never covered. */
    children?: ReactNode;
    className?: string;
};

/** For a thumbnail that is a card's picture: hovering the card (a `group`) lifts it a little off the page. */
export const thumbnailLiftClasses =
    "transition-[translate,box-shadow] duration-(--duration-base) ease-out group-hover:-translate-y-0.5 group-hover:shadow-overlay";

/**
 * 16:9 thumbnail with fixed dimensions (no layout shift), lazy loading and a placeholder when missing. The caller sets
 * the width through `className` (`w-full` in grids). Inside a `group` (a card), hovering it zooms the picture a little
 * and thickens the strip.
 */
export function VideoThumbnail({
    thumbnailPath,
    durationSeconds,
    progress = 0,
    watched = false,
    children,
    className,
}: VideoThumbnailProps) {
    // Remembers which path failed, so a new thumbnail (another frame, a regenerated one) gets its own chance to load.
    const [failedPath, setFailedPath] = useState<string | null>(null);
    const showImage = thumbnailPath !== null && thumbnailPath !== failedPath;
    const inProgress = !watched && progress > 0 && progress < 1;

    return (
        <div className={cx("relative aspect-video overflow-hidden rounded-card bg-surface-raised", className)}>
            {showImage ? (
                <img
                    src={convertFileSrc(thumbnailPath)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailedPath(thumbnailPath)}
                    className={cx(
                        // Inside a hovered card (a `group`), the picture grows slightly within its frame.
                        "size-full object-cover transition-[opacity,scale] duration-(--duration-slow) ease-out",
                        "group-hover:scale-103",
                        watched && "opacity-55"
                    )}
                />
            ) : (
                <div className="flex size-full items-center justify-center">
                    <Film className="size-8 text-text-subtle" strokeWidth={1.5} aria-hidden />
                </div>
            )}
            {durationSeconds !== undefined && durationSeconds > 0 && (
                <span className="absolute right-2 bottom-2 rounded-badge bg-scrim px-1.5 py-0.5 text-caption font-medium text-text tabular-nums">
                    {formatDuration(durationSeconds)}
                </span>
            )}
            {children}
            {(inProgress || watched) && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-scrim transition-[height] duration-(--duration-fast) ease-standard group-hover:h-1.5">
                    {watched ? (
                        // A full strip in the watched color; the word stays for screen readers.
                        <div className="h-full bg-success">
                            <span className="sr-only">Watched</span>
                        </div>
                    ) : (
                        <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                    )}
                </div>
            )}
        </div>
    );
}
