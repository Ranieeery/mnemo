import { Circle, CircleCheckBig, ExternalLink, FolderOpen, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import type { Video } from "../../../shared/ipc/bindings";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { openVideoDetails } from "../../../shared/stores/dialogs";
import { Badge, Button, IconButton } from "../../../shared/ui";
import { openInDefaultPlayer, showInFileManager, useSetWatched } from "../../../shared/video";

type VideoInfoProps = {
    path: string;
    title: string;
    video: Video | null;
    /** Where the video is in its playlist (0-based) and how long the playlist is; `position` is -1 while unknown. */
    position: number;
    total: number;
    /** The video's tags, shown with its description. */
    tags?: ReactNode;
};

export function VideoInfo({ path, title, video, position, total, tags }: VideoInfoProps) {
    const setWatched = useSetWatched();
    const facts = [
        position === -1 ? null : `Video ${position + 1} of ${total}`,
        video && video.durationSeconds > 0 ? formatDuration(video.durationSeconds) : null,
    ].filter((fact) => fact !== null);

    return (
        <section className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-heading font-semibold break-words text-text">{title}</h1>
                    <div className="flex flex-wrap items-center gap-2 text-small text-text-muted tabular-nums">
                        {facts.length > 0 && <span>{facts.join(", ")}</span>}
                        {video?.isWatched && <Badge tone="success">Watched</Badge>}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {video && (
                        <>
                            {/* A toggle with a constant label (the state is pressed or not): green with a check when
                                watched, neutral with an empty circle when not. */}
                            <Button
                                variant={video.isWatched ? "success" : "secondary"}
                                icon={video.isWatched ? <CircleCheckBig /> : <Circle />}
                                aria-pressed={video.isWatched}
                                title={video.isWatched ? "Mark as unwatched" : "Mark as watched"}
                                onClick={() => setWatched.mutate({ video, watched: !video.isWatched })}
                            >
                                Watched
                            </Button>
                            <Button icon={<PencilLine />} onClick={() => openVideoDetails(video)}>
                                Details and tags
                            </Button>
                        </>
                    )}
                    <Button icon={<ExternalLink />} onClick={() => openInDefaultPlayer(path)}>
                        Open externally
                    </Button>
                    <IconButton
                        label="Show in file manager"
                        icon={<FolderOpen />}
                        onClick={() => showInFileManager(path)}
                    />
                </div>
            </div>
            {/* Disappears when it has neither a description nor tags. */}
            <div className="flex max-w-3xl flex-col gap-3 rounded-card border border-transparent bg-surface p-4 empty:hidden">
                {video?.description ? (
                    <p className="text-body whitespace-pre-wrap text-text-muted">{video.description}</p>
                ) : null}
                {video && tags}
            </div>
            {!video && (
                <p className="text-small text-text-subtle">
                    This video has not been read yet, so its progress is not saved. It is added to the library the next
                    time its folder is processed.
                </p>
            )}
        </section>
    );
}
