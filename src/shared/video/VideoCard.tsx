import { Check } from "lucide-react";
import { useId } from "react";
import type { VideoEntry } from "../ipc/bindings";
import { cx } from "../lib/cx";
import { Badge, Skeleton } from "../ui";
import { entryDescription, entryTitle, watchedFraction } from "./entry";
import { usePlayVideo } from "./useVideoActions";
import { VideoContextMenu } from "./VideoContextMenu";
import { thumbnailLiftClasses, VideoThumbnail } from "./VideoThumbnail";

type VideoCardProps = {
    entry: VideoEntry;
    /** Secondary line under the title, e.g. the folder a search result comes from. */
    detail?: string;
    /** `horizontal` puts a small thumbnail beside the text, for compact lists. */
    orientation?: "vertical" | "horizontal";
    className?: string;
};

/** A video in a grid or a list: plays on click, offers the video actions on right-click. */
export function VideoCard({ entry, detail, orientation = "vertical", className }: VideoCardProps) {
    const { video } = entry;
    const title = entryTitle(entry);
    const playVideo = usePlayVideo();
    const descriptionId = useId();
    const description = entryDescription(entry, detail);
    const horizontal = orientation === "horizontal";

    return (
        <VideoContextMenu entry={entry}>
            <button
                type="button"
                onClick={() => playVideo(entry)}
                aria-label={video?.isWatched ? `${title}, watched` : title}
                aria-describedby={description ? descriptionId : undefined}
                className={cx(
                    "group flex w-full min-w-0 rounded-card text-left",
                    horizontal
                        ? "items-center gap-3 p-2 transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-raised"
                        : "flex-col gap-2 transition-transform duration-(--duration-fast) ease-standard active:scale-99",
                    className
                )}
            >
                <VideoThumbnail
                    thumbnailPath={video?.thumbnailPath ?? null}
                    durationSeconds={video?.durationSeconds}
                    progress={video ? watchedFraction(video) : 0}
                    watched={video?.isWatched}
                    className={horizontal ? "w-32 shrink-0 rounded-control" : cx("w-full", thumbnailLiftClasses)}
                />
                <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                    <span
                        className={cx(
                            "line-clamp-2 font-medium break-words",
                            horizontal ? "text-small" : "text-body",
                            video?.isWatched ? "text-text-muted" : "text-text"
                        )}
                        title={title}
                    >
                        {title}
                    </span>
                    {video?.isWatched ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-small text-text-subtle">
                            <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} aria-hidden />
                            <span className="truncate">{detail ?? "Watched"}</span>
                        </span>
                    ) : (
                        detail && <span className="truncate text-small text-text-subtle">{detail}</span>
                    )}
                    {!video && (
                        <Badge tone="neutral" className="mt-1 self-start">
                            Not processed
                        </Badge>
                    )}
                </div>
                {/* The label is only the title (and whether it is watched); the rest of the card is its description. */}
                {description && (
                    <span id={descriptionId} hidden>
                        {description}
                    </span>
                )}
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
