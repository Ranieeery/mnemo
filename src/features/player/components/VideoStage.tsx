import { useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { Video } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { type Cue, cueTextAt } from "../../../shared/lib/subtitles";
import { Button, ErrorState, toast } from "../../../shared/ui";
import { openInDefaultPlayer } from "../../../shared/video";
import { usePlayback } from "../hooks/usePlayback";
import { usePlayerShortcuts } from "../hooks/usePlayerShortcuts";
import { useAutoHide, useFlash, useFullscreen } from "../hooks/useStageUi";
import { ProgressSaver, resumePosition } from "../lib/progress";
import type { PlayerCommand } from "../lib/shortcuts";
import { saveProgress } from "../queries";
import { playerPreferences, usePlayerStore } from "../store";
import { PlayerControls } from "./PlayerControls";

type VideoStageProps = {
    path: string;
    /** Library record; `null` plays the file without saving progress. */
    video: Video | null;
    cues: readonly Cue[];
    onEnded: () => void;
    onClose: () => void;
};

/** In theater mode the video may fill the window below the player header (h-14). */
export function stageHeight(theater: boolean) {
    return theater ? "max-h-[calc(100vh-3.5rem)]" : "max-h-[70vh]";
}

/** The video with its controls, subtitles and keyboard shortcuts. Remount it (key) for each video. */
export function VideoStage({ path, video, cues, onEnded, onClose }: VideoStageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const playback = usePlayback(videoRef);
    const { visible, reveal } = useAutoHide(playback.playing);
    const { flash, show } = useFlash();
    const fullscreen = useFullscreen(containerRef);
    const { volume, muted, speed, subtitlesEnabled, theater } = usePlayerStore(
        useShallow(({ volume, muted, speed, subtitlesEnabled, theater }) => ({
            volume,
            muted,
            speed,
            subtitlesEnabled,
            theater,
        }))
    );
    const saver = useProgressSaver(video);
    const [unplayable, setUnplayable] = useState(false);
    // The record changes after every save and the callbacks may too; the element listeners read the latest ones.
    const latestVideo = useRef(video);
    latestVideo.current = video;
    const latestOnEnded = useRef(onEnded);
    latestOnEnded.current = onEnded;

    // Preferences apply to the element whenever they change (and after loading, which resets the rate).
    useEffect(() => {
        const element = videoRef.current;
        if (element) {
            element.volume = volume;
            element.muted = muted;
            element.defaultPlaybackRate = speed;
            element.playbackRate = speed;
        }
    }, [volume, muted, speed]);

    useEffect(() => {
        const element = videoRef.current;
        if (!element) {
            return;
        }
        const onMetadata = () => {
            element.playbackRate = usePlayerStore.getState().speed;
            const start = resumePosition(latestVideo.current, element.duration);
            if (start > 0) {
                element.currentTime = start;
                show(`Resumed at ${formatDuration(start)}`);
            }
        };
        const onTime = () => !element.paused && saver.tick(element.currentTime);
        const onPause = () => saver.flush(element.currentTime);
        const onEnd = () => {
            saver.finish(element.duration);
            latestOnEnded.current();
        };
        element.addEventListener("loadedmetadata", onMetadata);
        element.addEventListener("timeupdate", onTime);
        element.addEventListener("pause", onPause);
        element.addEventListener("ended", onEnd);
        return () => {
            element.removeEventListener("loadedmetadata", onMetadata);
            element.removeEventListener("timeupdate", onTime);
            element.removeEventListener("pause", onPause);
            element.removeEventListener("ended", onEnd);
            // Closing the player keeps the position.
            saver.flush(element.currentTime);
        };
    }, [saver, show]);

    const runCommand = (command: PlayerCommand) => {
        reveal();
        switch (command.type) {
            case "togglePlay":
                playback.togglePlay();
                return show(playback.playing ? "Paused" : "Playing");
            case "seek":
                playback.seekBy(command.by);
                return show(command.by > 0 ? `+${command.by}s` : `−${-command.by}s`);
            case "volume":
                playerPreferences.changeVolume(command.by);
                return show(`Volume ${Math.round(usePlayerStore.getState().volume * 100)}%`);
            case "speed":
                playerPreferences.changeSpeed(command.by);
                return show(`${usePlayerStore.getState().speed}×`);
            case "resetSpeed":
                playerPreferences.setSpeed(1);
                return show("1×");
            case "mute":
                playerPreferences.toggleMute();
                return show(usePlayerStore.getState().muted ? "Muted" : "Sound on");
            case "subtitles":
                if (cues.length === 0) {
                    return show("No subtitles for this video");
                }
                playerPreferences.toggleSubtitles();
                return show(usePlayerStore.getState().subtitlesEnabled ? "Subtitles on" : "Subtitles off");
            case "fullscreen":
                return fullscreen.toggle();
            case "theater":
                return playerPreferences.toggleTheater();
            case "close":
                if (document.fullscreenElement) {
                    return void document.exitFullscreen();
                }
                return onClose();
        }
    };
    usePlayerShortcuts(runCommand);

    const subtitle = subtitlesEnabled ? cueTextAt(cues, playback.currentTime) : "";

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: pointer movement only reveals the controls.
        <div
            ref={containerRef}
            onMouseMove={reveal}
            className={cx(
                "relative flex items-center justify-center overflow-hidden bg-backdrop",
                fullscreen.isFullscreen ? "size-full" : cx("aspect-video w-full", stageHeight(theater)),
                !visible && "cursor-none"
            )}
        >
            {/* biome-ignore lint/a11y/useMediaCaption: external subtitles are drawn by the overlay below. */}
            <video
                ref={videoRef}
                src={convertFileSrc(path)}
                autoPlay
                preload="metadata"
                onClick={playback.togglePlay}
                onError={() => setUnplayable(true)}
                className="size-full object-contain"
            />
            {unplayable && (
                <div className="absolute inset-0 flex items-center justify-center bg-backdrop">
                    <ErrorState
                        title="This video can't be played here"
                        message="Its format is not supported by the built-in player. It may still play in another app."
                    >
                        <Button className="mt-2" onClick={() => openInDefaultPlayer(path)}>
                            Open in default player
                        </Button>
                    </ErrorState>
                </div>
            )}
            {subtitle && (
                <div
                    className={cx(
                        "pointer-events-none absolute inset-x-0 flex justify-center px-8 transition-[bottom] duration-(--duration-base) ease-standard",
                        visible ? "bottom-28" : "bottom-10"
                    )}
                >
                    <p className="max-w-3xl rounded-control bg-scrim px-3 py-1.5 text-center text-title whitespace-pre-line text-text">
                        {subtitle}
                    </p>
                </div>
            )}
            {flash && (
                <div key={flash.id} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="animate-pop-in rounded-card bg-scrim px-4 py-2 text-title font-semibold text-text tabular-nums">
                        {flash.label}
                    </span>
                </div>
            )}
            <PlayerControls
                playback={playback}
                hasSubtitles={cues.length > 0}
                isFullscreen={fullscreen.isFullscreen}
                onToggleFullscreen={fullscreen.toggle}
                visible={visible || !playback.playing}
            />
        </div>
    );
}

/** One saver per video; failures are reported once, not every few seconds. */
function useProgressSaver(video: Video | null) {
    const queryClient = useQueryClient();
    const latest = useRef(video);
    return useMemo(() => {
        let reported = false;
        return new ProgressSaver((positionSeconds, finished) => {
            const current = latest.current;
            if (!current) {
                return;
            }
            saveProgress(queryClient, current, positionSeconds, finished)
                .then((updated) => {
                    latest.current = updated;
                })
                .catch((error: unknown) => {
                    if (!reported) {
                        reported = true;
                        toast({
                            title: "Could not save your progress",
                            description: errorMessage(error),
                            tone: "danger",
                        });
                    }
                });
        });
    }, [queryClient]);
}
