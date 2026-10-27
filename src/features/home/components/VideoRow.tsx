import type { ReactNode } from "react";
import type { Video } from "../../../shared/ipc/bindings";
import { Skeleton } from "../../../shared/ui";
import { toEntry, VideoCard, VideoCardSkeleton } from "../../../shared/video";

type VideoRowProps = {
    heading: ReactNode;
    videos: readonly Video[];
    columns: number;
    /** Secondary line of each card, e.g. its folder. */
    detail?: (video: Video) => string;
};

/** One home section: a heading and a single row with as many cards as fit the width. */
export function VideoRow({ heading, videos, columns, detail }: VideoRowProps) {
    if (videos.length === 0) {
        return null;
    }
    return (
        <section className="flex flex-col gap-3">
            {heading}
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {videos.slice(0, columns).map((video) => (
                    <VideoCard key={video.id} entry={toEntry(video)} detail={detail?.(video)} />
                ))}
            </div>
        </section>
    );
}

export function VideoRowSkeleton({ columns }: { columns: number }) {
    return (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading videos">
            <Skeleton className="h-6 w-48" />
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {Array.from({ length: columns }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                    <VideoCardSkeleton key={index} />
                ))}
            </div>
        </div>
    );
}

export function SectionHeading({ children }: { children: ReactNode }) {
    return <h2 className="text-title font-semibold text-text">{children}</h2>;
}
