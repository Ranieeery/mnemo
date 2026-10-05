import { useMemo, useRef } from "react";
import type { VideoEntry } from "../ipc/bindings";
import { useColumns, VirtualList } from "../ui";
import { VideoCard, VideoCardSkeleton } from "./VideoCard";

export const VIDEO_CARD_MIN_WIDTH = 216;
export const VIDEO_GRID_GAP = 16;

/** Grid classes; the column count is computed so virtualized rows and the CSS grid agree. */
const gridClasses = "grid gap-x-4 gap-y-6";

type VideoGridProps = {
    entries: readonly VideoEntry[];
    /** Secondary line for each card, e.g. its folder in search results. */
    detail?: (entry: VideoEntry) => string | undefined;
};

/** Responsive, virtualized grid of video cards. Must be inside a ScrollContainer. */
export function VideoGrid({ entries, detail }: VideoGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const columns = useColumns(containerRef, VIDEO_CARD_MIN_WIDTH, VIDEO_GRID_GAP);
    const rows = useMemo(() => chunk(entries, columns), [entries, columns]);

    return (
        <div ref={containerRef}>
            <VirtualList
                items={rows}
                getKey={(row) => row[0]?.path ?? ""}
                estimateSize={() => 240}
                renderItem={(row) => (
                    <div
                        className={`${gridClasses} pb-6`}
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                        {row.map((entry) => (
                            <VideoCard key={entry.path} entry={entry} detail={detail?.(entry)} />
                        ))}
                    </div>
                )}
            />
        </div>
    );
}

/** Loading state of a grid: a couple of rows of card skeletons. */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div
            role="status"
            aria-label="Loading videos"
            className={gridClasses}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${VIDEO_CARD_MIN_WIDTH}px, 1fr))` }}
        >
            {Array.from({ length: count }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                <VideoCardSkeleton key={index} />
            ))}
        </div>
    );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        rows.push(items.slice(index, index + size));
    }
    return rows;
}
