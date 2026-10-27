import { Check } from "lucide-react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { entryTitle, VideoThumbnail, watchedFraction } from "../../../shared/video";

type PlaylistItemProps = {
    entry: VideoEntry;
    /** The video playing now: marked, and not a button, since choosing it would do nothing. */
    current: boolean;
    onSelect: (entry: VideoEntry) => void;
};

/** One video of the playlist beside (or below) the player. */
export function PlaylistItem({ entry, current, onSelect }: PlaylistItemProps) {
    const { video } = entry;
    const watched = video?.isWatched ?? false;
    const content = (
        <>
            <VideoThumbnail
                thumbnailPath={video?.thumbnailPath ?? null}
                progress={video ? watchedFraction(video) : 0}
                watched={watched}
                className="w-2/5 max-w-48 shrink-0 rounded-control"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
                <span
                    className={cx(
                        "line-clamp-2 text-small font-medium break-words",
                        watched && !current ? "text-text-muted" : "text-text"
                    )}
                >
                    {entryTitle(entry)}
                </span>
                <StatusLine entry={entry} current={current} />
            </span>
        </>
    );

    if (current) {
        return (
            <div
                aria-current="true"
                className={cx(
                    "relative flex w-full gap-3 border border-transparent bg-surface-raised px-3 py-2 forced-colors:border-current",
                    "before:absolute before:inset-y-2 before:left-0 before:w-0.75 before:rounded-full before:bg-accent"
                )}
            >
                {content}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={() => onSelect(entry)}
            className="flex w-full gap-3 px-3 py-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover"
        >
            {content}
        </button>
    );
}

function StatusLine({ entry, current }: { entry: VideoEntry; current: boolean }) {
    const { video } = entry;
    if (current) {
        return <span className="text-caption font-medium text-text">Now playing</span>;
    }
    if (video?.isWatched) {
        // Hidden from screen readers: the thumbnail already says "Watched" in the row's name.
        return (
            <span aria-hidden className="flex items-center gap-1 text-caption text-text-subtle">
                <Check className="size-3 shrink-0 text-success" strokeWidth={3} aria-hidden />
                Watched
            </span>
        );
    }
    return video && video.durationSeconds > 0 ? (
        <span className="text-caption text-text-subtle tabular-nums">{formatDuration(video.durationSeconds)}</span>
    ) : null;
}
