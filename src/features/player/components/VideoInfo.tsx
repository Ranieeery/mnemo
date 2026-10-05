import { Link } from "@tanstack/react-router";
import { Circle, CircleCheck, ExternalLink, FolderOpen, PencilLine } from "lucide-react";
import type { Video } from "../../../shared/ipc/bindings";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { baseName, parentPath } from "../../../shared/lib/paths";
import { openVideoDetails } from "../../../shared/stores/dialogs";
import { Badge, Button, IconButton } from "../../../shared/ui";
import { openInDefaultPlayer, showInFileManager, useSetWatched, watchedFraction } from "../../../shared/video";

type VideoInfoProps = {
    path: string;
    title: string;
    video: Video | null;
};

export function VideoInfo({ path, title, video }: VideoInfoProps) {
    const setWatched = useSetWatched();
    const folder = parentPath(path);
    const percent = video ? Math.round(watchedFraction(video) * 100) : 0;

    return (
        <section className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-heading font-semibold text-text">{title}</h1>
                    <div className="flex flex-wrap items-center gap-2 text-small text-text-muted">
                        <Link
                            to="/folder"
                            search={{ path: folder }}
                            className="hover:text-text hover:underline underline-offset-4"
                        >
                            {baseName(folder)}
                        </Link>
                        {video && video.durationSeconds > 0 && (
                            <span className="tabular-nums">{formatDuration(video.durationSeconds)}</span>
                        )}
                        {video?.isWatched && <Badge tone="success">Watched</Badge>}
                        {video && !video.isWatched && percent > 0 && <Badge>{percent}% watched</Badge>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {video && (
                        <>
                            <Button
                                icon={video.isWatched ? <Circle /> : <CircleCheck />}
                                onClick={() => setWatched.mutate({ video, watched: !video.isWatched })}
                            >
                                {video.isWatched ? "Mark as unwatched" : "Mark as watched"}
                            </Button>
                            <Button icon={<PencilLine />} onClick={() => openVideoDetails(video)}>
                                Details and tags
                            </Button>
                        </>
                    )}
                    <IconButton
                        label="Open in default player"
                        icon={<ExternalLink />}
                        onClick={() => openInDefaultPlayer(path)}
                    />
                    <IconButton
                        label="Show in file manager"
                        icon={<FolderOpen />}
                        onClick={() => showInFileManager(path)}
                    />
                </div>
            </div>
            {video?.description && (
                <p className="max-w-3xl text-body whitespace-pre-wrap text-text-muted">{video.description}</p>
            )}
            {!video && (
                <p className="text-small text-text-subtle">
                    This video has not been read yet, so its progress is not saved. It is added to the library the next
                    time its folder is processed.
                </p>
            )}
        </section>
    );
}
