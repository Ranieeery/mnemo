import { Link } from "@tanstack/react-router";
import { Circle, CircleCheckBig, ExternalLink, FolderOpen, PencilLine } from "lucide-react";
import type { Video } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { baseName, parentPath } from "../../../shared/lib/paths";
import { openVideoDetails } from "../../../shared/stores/dialogs";
import { Badge, Button, IconButton } from "../../../shared/ui";
import { openInDefaultPlayer, showInFileManager, useSetWatched } from "../../../shared/video";

type VideoInfoProps = {
    path: string;
    title: string;
    video: Video | null;
};

export function VideoInfo({ path, title, video }: VideoInfoProps) {
    const setWatched = useSetWatched();
    const folder = parentPath(path);

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
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {video && (
                        <>
                            {/* A toggle: green with a check when watched, neutral with an empty circle when not. */}
                            <Button
                                variant={video.isWatched ? "success" : "secondary"}
                                icon={video.isWatched ? <CircleCheckBig /> : <Circle />}
                                aria-pressed={video.isWatched}
                                title={video.isWatched ? "Mark as unwatched" : undefined}
                                onClick={() => setWatched.mutate({ video, watched: !video.isWatched })}
                            >
                                {/* Both labels share one grid cell, so the button keeps the width of the longer one. */}
                                <span className="grid">
                                    <span
                                        aria-hidden={!video.isWatched}
                                        className={cx("col-start-1 row-start-1", !video.isWatched && "invisible")}
                                    >
                                        Watched
                                    </span>
                                    <span
                                        aria-hidden={video.isWatched}
                                        className={cx("col-start-1 row-start-1", video.isWatched && "invisible")}
                                    >
                                        Mark as watched
                                    </span>
                                </span>
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
