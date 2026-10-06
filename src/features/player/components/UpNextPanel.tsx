import type { VideoEntry } from "../../../shared/ipc/bindings";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { ScrollContainer, VirtualList } from "../../../shared/ui";
import { entryTitle, VideoThumbnail, watchedFraction } from "../../../shared/video";

type UpNextPanelProps = {
    /** Videos after the current one, in playback order. */
    entries: readonly VideoEntry[];
    onSelect: (entry: VideoEntry) => void;
    /** Below the video in theater mode, the list scrolls with the page instead of on its own. */
    scrollsWithPage?: boolean;
};

export function UpNextPanel({ entries, onSelect, scrollsWithPage = false }: UpNextPanelProps) {
    const list = entries.length > 0 && (
        <VirtualList
            items={entries}
            getKey={(entry) => entry.path}
            estimateSize={() => 76}
            renderItem={(entry) => (
                <button
                    type="button"
                    onClick={() => onSelect(entry)}
                    className="flex w-full gap-3 px-3 py-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover"
                >
                    <VideoThumbnail
                        thumbnailPath={entry.video?.thumbnailPath ?? null}
                        progress={entry.video ? watchedFraction(entry.video) : 0}
                        watched={entry.video?.isWatched}
                        className="w-28 shrink-0 rounded-control"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="line-clamp-2 text-small font-medium text-text">{entryTitle(entry)}</span>
                        {entry.video && entry.video.durationSeconds > 0 && (
                            <span className="text-caption text-text-subtle tabular-nums">
                                {formatDuration(entry.video.durationSeconds)}
                            </span>
                        )}
                    </span>
                </button>
            )}
        />
    );

    return (
        <aside
            aria-labelledby="up-next-heading"
            className="flex w-80 shrink-0 flex-col border-l border-border bg-surface"
        >
            <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                <h2 id="up-next-heading" className="text-body font-semibold text-text">
                    Up next
                </h2>
                <span className="text-small text-text-subtle tabular-nums">{entries.length}</span>
            </header>
            {entries.length === 0 ? (
                <p className="px-4 py-6 text-small text-text-muted">This is the last video of the playlist.</p>
            ) : scrollsWithPage ? (
                list
            ) : (
                <ScrollContainer className="flex-1">{list}</ScrollContainer>
            )}
        </aside>
    );
}
