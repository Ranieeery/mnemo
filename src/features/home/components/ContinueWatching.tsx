import { Folder, Play } from "lucide-react";
import { useId } from "react";
import type { Video } from "../../../shared/ipc/bindings";
import { formatRemaining } from "../../../shared/lib/formatRemaining";
import { buttonClasses } from "../../../shared/ui";
import {
    entryDescription,
    toEntry,
    usePlayVideo,
    VideoCard,
    VideoContextMenu,
    VideoThumbnail,
    watchedFraction,
} from "../../../shared/video";

/** How many videos in progress the list beside the highlighted one shows. */
const ALSO_IN_PROGRESS = 3;

type ContinueWatchingProps = {
    videos: readonly Video[];
    /** Name of the folder a video is in. */
    folderOf: (video: Video) => string;
};

/**
 * The first section of the home: the video most likely to be resumed, large, with the next ones in progress beside
 * it in a compact list.
 */
export function ContinueWatching({ videos, folderOf }: ContinueWatchingProps) {
    const headingId = useId();
    const [first, ...rest] = videos;
    if (!first) {
        return null;
    }
    const others = rest.slice(0, ALSO_IN_PROGRESS);

    return (
        <section aria-labelledby={headingId} className="flex flex-wrap gap-6">
            <h2 id={headingId} className="sr-only">
                Continue watching
            </h2>
            <ResumeCard video={first} folder={folderOf(first)} />
            {others.length > 0 && (
                <div className="flex min-w-0 grow basis-72 flex-col gap-1">
                    <h3 className="px-2 pb-1 text-small font-medium text-text-muted">Also in progress</h3>
                    {others.map((video) => (
                        <VideoCard
                            key={video.id}
                            entry={toEntry(video)}
                            orientation="horizontal"
                            detail={formatRemaining(video.durationSeconds, video.watchProgressSeconds)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

/** The highlighted video: one button that resumes it, with the video actions on right-click like any card. */
function ResumeCard({ video, folder }: { video: Video; folder: string }) {
    const entry = toEntry(video);
    const playVideo = usePlayVideo();
    const descriptionId = useId();
    const fraction = watchedFraction(video);
    const remaining = formatRemaining(video.durationSeconds, video.watchProgressSeconds);

    return (
        <VideoContextMenu entry={entry}>
            <button
                type="button"
                onClick={() => playVideo(entry)}
                aria-label={video.title}
                aria-describedby={descriptionId}
                className="group flex min-w-0 grow-2 basis-144 flex-wrap items-center gap-6 rounded-dialog border border-transparent bg-surface p-4 text-left shadow-raised transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-raised"
            >
                <VideoThumbnail
                    thumbnailPath={video.thumbnailPath}
                    durationSeconds={video.durationSeconds}
                    progress={fraction}
                    className="min-w-0 grow basis-72"
                />
                <span className="flex min-w-0 grow basis-60 flex-col gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-small text-text-muted">
                        <Folder className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{folder}</span>
                    </span>
                    <span className="line-clamp-2 text-heading font-semibold break-words text-text">{video.title}</span>
                    <span className="flex flex-col gap-2">
                        <span className="h-1 overflow-hidden rounded-full bg-surface-hover">
                            <span className="block h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
                        </span>
                        <span className="text-small text-text-muted tabular-nums">{remaining}</span>
                    </span>
                    {/* Looks like a button but is part of this one, so the card stays a single stop for Tab. */}
                    <span className={buttonClasses("primary", "md", "mt-1 self-start")}>
                        <Play className="fill-current" aria-hidden />
                        Resume
                    </span>
                </span>
                <span id={descriptionId} hidden>
                    {entryDescription(entry, `${folder}, ${remaining}`)}
                </span>
            </button>
        </VideoContextMenu>
    );
}
