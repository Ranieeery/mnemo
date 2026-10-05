import type { VideoEntry } from "../ipc/bindings";
import { cx } from "../lib/cx";
import { Badge, Skeleton } from "../ui";
import { entryTitle, watchedFraction } from "./entry";
import { usePlayVideo } from "./useVideoActions";
import { VideoContextMenu } from "./VideoContextMenu";
import { VideoThumbnail } from "./VideoThumbnail";

type VideoCardProps = {
    entry: VideoEntry;
    /** Secondary line under the title, e.g. the folder a search result comes from. */
    detail?: string;
    className?: string;
};

/** A video in a grid: plays on click, offers the video actions on right-click. */
export function VideoCard({ entry, detail, className }: VideoCardProps) {
    const { video } = entry;
    const title = entryTitle(entry);
    const playVideo = usePlayVideo();

    return (
        <VideoContextMenu entry={entry}>
            <button
                type="button"
                onClick={() => playVideo(entry)}
                aria-label={video?.isWatched ? `${title}, watched` : title}
                className={cx(
                    "group flex w-full min-w-0 flex-col gap-2 rounded-card text-left",
                    "transition-transform duration-(--duration-fast) ease-standard active:scale-[0.99]",
                    className
                )}
            >
                <VideoThumbnail
                    thumbnailPath={video?.thumbnailPath ?? null}
                    durationSeconds={video?.durationSeconds}
                    progress={video ? watchedFraction(video) : 0}
                    watched={video?.isWatched}
                    className="transition-shadow duration-(--duration-fast) ease-standard group-hover:shadow-overlay"
                />
                <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                    <span
                        className={cx(
                            "line-clamp-2 text-body font-medium",
                            video?.isWatched ? "text-text-muted" : "text-text"
                        )}
                        title={title}
                    >
                        {title}
                    </span>
                    {detail && <span className="truncate text-small text-text-subtle">{detail}</span>}
                    {!video && (
                        <Badge tone="neutral" className="mt-1 self-start">
                            Not processed
                        </Badge>
                    )}
                </div>
            </button>
        </VideoContextMenu>
    );
}

/** Placeholder with the card's exact shape while videos load. */
export function VideoCardSkeleton() {
    return (
        <div className="flex flex-col gap-2">
            <Skeleton className="aspect-video w-full rounded-card" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
        </div>
    );
}
