import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { cx } from "../../../shared/lib/cx";
import { baseName, parentPath } from "../../../shared/lib/paths";
import { ErrorState, IconButton, ScrollContainer, Skeleton } from "../../../shared/ui";
import { usePlaylist, useSubtitleCues, useVideoRecord } from "../queries";
import { playerPreferences, usePlayerStore } from "../store";
import { NextVideoDialog } from "./NextVideoDialog";
import { UpNextPanel } from "./UpNextPanel";
import { VideoInfo } from "./VideoInfo";
import { stageHeight, VideoStage } from "./VideoStage";

export function PlayerPage({ path }: { path: string }) {
    const router = useRouter();
    const navigate = useNavigate();
    const record = useVideoRecord(path);
    const playlist = usePlaylist(path);
    const cues = useSubtitleCues(path);
    const [nextPrompt, setNextPrompt] = useState<VideoEntry | null>(null);
    const theater = usePlayerStore((state) => state.theater);

    // The route remounts this page for every video (keyed by path).
    useEffect(() => {
        playerPreferences.startVideo();
    }, []);

    const entries = playlist.data ?? [];
    const position = entries.findIndex((entry) => entry.path === path);
    const following = position === -1 ? [] : entries.slice(position + 1);
    const next = following[0] ?? null;

    /** Closing goes back to where the video was opened from, or to its folder when there is no history. */
    const close = useCallback(() => {
        if (router.history.canGoBack()) {
            router.history.back();
        } else {
            void navigate({ to: "/folder", search: { path: parentPath(path) } });
        }
    }, [router, navigate, path]);

    /** Moving within the playlist replaces the entry, so "back" still returns to the folder. */
    const play = useCallback(
        (entry: VideoEntry) => {
            playerPreferences.continueWithNext();
            void navigate({ to: "/watch", search: { path: entry.path }, replace: true });
        },
        [navigate]
    );

    const handleEnded = useCallback(() => setNextPrompt(next), [next]);
    const playNext = useCallback(() => nextPrompt && play(nextPrompt), [nextPrompt, play]);
    const title = record.data?.title ?? baseName(path).replace(/\.[^.]+$/, "");

    const upNext = <UpNextPanel entries={following} onSelect={play} scrollsWithPage={theater} />;

    return (
        <div className="flex h-screen flex-col bg-background text-text">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
                <IconButton label="Close player" shortcut="Esc" icon={<ArrowLeft />} onClick={close} />
                <span className="min-w-0 truncate text-lead font-medium">{title}</span>
            </header>
            {/* Both layouts keep the video at the same place in the tree, so switching never reloads it. */}
            <div className="flex min-h-0 flex-1">
                <ScrollContainer className="min-w-0 flex-1">
                    {record.isPending && (
                        <Skeleton className={cx("aspect-video w-full rounded-none", stageHeight(theater))} />
                    )}
                    {record.isError && (
                        <ErrorState
                            title="Could not open the video"
                            message={errorMessage(record.error)}
                            onRetry={() => record.refetch()}
                        />
                    )}
                    {/* Wait for the record so playback can resume from the saved position. */}
                    {record.isSuccess && (
                        <VideoStage
                            key={path}
                            path={path}
                            video={record.data}
                            cues={cues.data ?? []}
                            onEnded={handleEnded}
                            onClose={close}
                        />
                    )}
                    {/* In theater mode the video spans the window and the playlist moves next to the details. */}
                    <div className="flex">
                        <div className="min-w-0 flex-1">
                            {record.isSuccess && <VideoInfo path={path} title={title} video={record.data} />}
                        </div>
                        {theater && upNext}
                    </div>
                </ScrollContainer>
                {!theater && upNext}
            </div>
            {nextPrompt && (
                <NextVideoDialog
                    key={nextPrompt.path}
                    next={nextPrompt}
                    onPlay={playNext}
                    onCancel={() => setNextPrompt(null)}
                />
            )}
        </div>
    );
}
