import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import type { HistoryEntry } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { baseName, parentPath } from "../../../shared/lib/paths";
import { Button, buttonClasses, EmptyState, ErrorState, Skeleton, toast, VirtualList } from "../../../shared/ui";
import { toEntry, usePlayVideo, VideoContextMenu, VideoThumbnail } from "../../../shared/video";
import { dayLabel, groupByDay, timeOfDay } from "../lib/history";
import { useWatchHistory } from "../queries";

type Row = { kind: "day"; day: string } | { kind: "entry"; entry: HistoryEntry };

/** The videos that became watched, grouped by day, newest first. Older pages load on request. */
export function WatchedVideos() {
    const history = useWatchHistory();
    const [today] = useState(() => new Date());
    const rows = useMemo(() => {
        const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
        return groupByDay(entries).flatMap((group): Row[] => [
            { kind: "day", day: group.day },
            ...group.entries.map((entry): Row => ({ kind: "entry", entry })),
        ]);
    }, [history.data]);

    if (history.isPending) {
        return <WatchedVideosSkeleton />;
    }
    // A failed older page also puts the query in error; the pages already shown stay (a toast reports it).
    if (history.isError && !history.data) {
        return (
            <ErrorState
                title="Could not load the history"
                message={errorMessage(history.error)}
                onRetry={() => history.refetch()}
            />
        );
    }
    if (rows.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="Nothing watched yet"
                description="Videos you finish show up here, grouped by the day you watched them."
                action={
                    <Link to="/" className={buttonClasses("secondary")}>
                        Go to home
                    </Link>
                }
            />
        );
    }

    const showOlder = async () => {
        const result = await history.fetchNextPage();
        if (result.isFetchNextPageError) {
            toast({ title: "Could not load older videos", description: errorMessage(result.error), tone: "danger" });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <VirtualList
                items={rows}
                getKey={(row) => (row.kind === "day" ? row.day : `${row.entry.day}|${row.entry.video.id}`)}
                estimateSize={(row) => (row.kind === "day" ? 52 : 92)}
                renderItem={(row) =>
                    row.kind === "day" ? (
                        <h2 className="pt-5 pb-2 text-title font-semibold text-text">{dayLabel(row.day, today)}</h2>
                    ) : (
                        <HistoryRow entry={row.entry} />
                    )
                }
            />
            {history.hasNextPage && (
                <Button className="self-center" loading={history.isFetchingNextPage} onClick={showOlder}>
                    Show older
                </Button>
            )}
        </div>
    );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
    const playVideo = usePlayVideo();
    const { video } = entry;
    const videoEntry = toEntry(video);

    return (
        <VideoContextMenu entry={videoEntry}>
            <button
                type="button"
                onClick={() => playVideo(videoEntry)}
                className="flex w-full items-center gap-4 rounded-card p-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover"
            >
                <VideoThumbnail
                    thumbnailPath={video.thumbnailPath}
                    durationSeconds={video.durationSeconds}
                    watched={video.isWatched}
                    className="w-32 shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body font-medium text-text" title={video.title}>
                        {video.title}
                    </span>
                    <span className="truncate text-small text-text-subtle">{baseName(parentPath(video.filePath))}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-small tabular-nums">
                    <time dateTime={entry.watchedAt} className="text-text-muted">
                        {timeOfDay(entry.watchedAt)}
                    </time>
                    <span className="text-text-subtle">{formatDuration(video.durationSeconds)}</span>
                </span>
            </button>
        </VideoContextMenu>
    );
}

function WatchedVideosSkeleton() {
    return (
        <div className="flex flex-col gap-2">
            <Skeleton className="mt-5 mb-2 h-6 w-32" />
            {["a", "b", "c", "d", "e", "f"].map((key) => (
                <div key={key} className="flex items-center gap-4 p-2">
                    <Skeleton className="aspect-video w-32 shrink-0" />
                    <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-1/4" />
                    </div>
                </div>
            ))}
        </div>
    );
}
