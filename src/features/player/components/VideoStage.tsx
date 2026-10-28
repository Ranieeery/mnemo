import { type RefObject, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { AudioTrack, Video } from "../../../shared/ipc/bindings";
import { useMediaTools, useSubtitleStyle } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { cueTextAt } from "../../../shared/lib/subtitles";
import { openInDefaultPlayer, SubtitleLine, useSetVideoThumbnail } from "../../../shared/video";
import { useAudioTracks } from "../hooks/useAudioTracks";
import { useMiniPlayer } from "../hooks/useMiniPlayer";
import { usePlayableSource } from "../hooks/usePlayableSource";
import { usePlayback } from "../hooks/usePlayback";
import { usePlayerShortcuts } from "../hooks/usePlayerShortcuts";
import { useProgressSaver } from "../hooks/useProgressSaver";
import { useAutoHide, useFlash, useFullscreen } from "../hooks/useStageUi";
import type { SubtitlesState } from "../hooks/useSubtitles";
import { resumePosition } from "../lib/progress";
import type { PlayerCommand } from "../lib/shortcuts";
import { audioFormatsOf } from "../lib/tracks";
import { useMediaTracks } from "../queries";
import { playerPreferences, usePlayerStore } from "../store";
import { MiniPlayerControls } from "./MiniPlayerControls";
import { NoSoundNotice } from "./NoSoundNotice";
import { PlayableCopyOverlay } from "./PlayableCopyOverlay";
import { PlayerControls } from "./PlayerControls";

type VideoStageProps = {
    path: string;
    /** Library record; `null` plays the file without saving progress. */
    video: Video | null;
    subtitles: SubtitlesState;
    onEnded: () => void;
    onClose: () => void;
};

/** In theater mode the video may fill the window below the player header (h-14). */
export function stageHeight(theater: boolean) {
    return theater ? "max-h-[calc(100vh-3.5rem)]" : "max-h-[70vh]";
}

const NO_AUDIO_TRACKS: readonly AudioTrack[] = [];

/** The video with its controls, subtitles and keyboard shortcuts. Remount it (key) for each video. */
export function VideoStage({ path, video, subtitles, onEnded, onClose }: VideoStageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const playback = usePlayback(videoRef);
    const { visible, reveal, focusHandlers } = useAutoHide(playback.playing);
    const { flash, show } = useFlash();
    const fullscreen = useFullscreen(containerRef);
    const miniPlayer = useMiniPlayer(videoRef);
    useFocusAcrossMiniPlayer(miniPlayer.mini, containerRef);
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
    const tools = useMediaTools();
    const subtitleStyle = useSubtitleStyle();
    const setThumbnail = useSetVideoThumbnail();
    const mediaTracks = useMediaTracks(path);
    const audio = useAudioTracks(videoRef, mediaTracks.data?.audio ?? NO_AUDIO_TRACKS);

    // A file whose audio the webview cannot decode plays silently, with no error; say so, even with one track.
    const silentFormats =
        audio.problem === "no-playable-audio" ? audioFormatsOf(audio.tracks.map((entry) => entry.track)) : null;
    const [noSoundDismissed, setNoSoundDismissed] = useState(false);
    const playable = usePlayableSource(path);
    // The record changes after every save and the callbacks may too; the element listeners read the latest ones.
    const latestVideo = useRef(video);
    latestVideo.current = video;
    const latestOnEnded = useRef(onEnded);
    latestOnEnded.current = onEnded;
    const latestFitMini = useRef(miniPlayer.fit);
    latestFitMini.current = miniPlayer.fit;

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
            // The next video in the mini player may have another shape.
            void latestFitMini.current();
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
                if (!subtitles.available) {
                    return show("No subtitles for this video");
                }
                playerPreferences.toggleSubtitles();
                return show(usePlayerStore.getState().subtitlesEnabled ? "Subtitles on" : "Subtitles off");
            case "fullscreen":
                if (miniPlayer.mini) {
                    // Over a window still in the mini player, full screen would leave both half applied.
                    return void miniPlayer.exit().then((exited) => exited && fullscreen.toggle());
                }
                return fullscreen.toggle();
            case "theater":
                playerPreferences.toggleTheater();
                // The mini player shows no page layout: say what it will be once it ends.
                if (miniPlayer.mini) {
                    show(usePlayerStore.getState().theater ? "Theater mode on" : "Theater mode off");
                }
                return;
            case "miniPlayer":
                if (!miniPlayer.available) {
                    return show("The mini player isn't supported on this system");
                }
                return void miniPlayer.toggle();
            case "close":
                // Esc steps out one level at a time: full screen, then the mini player, then the player.
                if (document.fullscreenElement) {
                    return void document.exitFullscreen();
                }
                if (miniPlayer.mini) {
                    return void miniPlayer.exit();
                }
                return onClose();
        }
    };
    usePlayerShortcuts(runCommand);

    const subtitle = subtitlesEnabled ? cueTextAt(subtitles.cues, playback.currentTime) : "";

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: pointer movement only reveals the controls.
        <div
            ref={containerRef}
            // Focus lands here when the controls swap (mini player), never in the tab order.
            tabIndex={-1}
            onMouseMove={reveal}
            {...focusHandlers}
            className={cx(
                // A size container: subtitles scale with the video.
                "@container relative flex items-center justify-center overflow-hidden bg-backdrop outline-none",
                fullscreen.isFullscreen
                    ? "size-full"
                    : miniPlayer.mini
                      ? "h-screen w-full"
                      : cx("aspect-video w-full", stageHeight(theater)),
                !visible && "cursor-none"
            )}
        >
            {/* biome-ignore lint/a11y/useMediaCaption: external subtitles are drawn by the overlay below. */}
            <video
                ref={videoRef}
                src={playable.src}
                autoPlay
                preload="metadata"
                onClick={playback.togglePlay}
                onError={playable.onError}
                className="size-full object-contain"
            />
            {silentFormats && !noSoundDismissed && playable.playing && (
                <NoSoundNotice
                    formats={silentFormats}
                    onOpenExternally={() => {
                        // Both players would otherwise run at once.
                        videoRef.current?.pause();
                        void openInDefaultPlayer(path);
                    }}
                    onDismiss={() => setNoSoundDismissed(true)}
                />
            )}
            <PlayableCopyOverlay
                source={playable.source}
                onAnswer={playable.answer}
                onMakeCopy={playable.makeCopy}
                onCancel={playable.cancel}
                onOpenExternally={() => void openInDefaultPlayer(path)}
            />
            {subtitle && <SubtitleLine text={subtitle} style={subtitleStyle} aboveControls={visible} />}
            {/* What a key did, for screen readers. Always present so changes are announced; a new node per flash
                repeats even the same text ("+10s" twice). */}
            <p role="status" className="sr-only">
                {flash && <span key={flash.id}>{flash.label}</span>}
            </p>
            {flash && (
                <div
                    key={flash.id}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                    <span className="animate-pop-in rounded-card bg-scrim px-4 py-2 text-title font-semibold text-text tabular-nums">
                        {flash.label}
                    </span>
                </div>
            )}
            {miniPlayer.mini ? (
                <MiniPlayerControls
                    playback={playback}
                    visible={visible}
                    onExpand={() => void miniPlayer.exit()}
                    onClose={onClose}
                />
            ) : (
                <PlayerControls
                    playback={playback}
                    path={path}
                    subtitles={subtitles}
                    audio={audio}
                    isFullscreen={fullscreen.isFullscreen}
                    onToggleFullscreen={fullscreen.toggle}
                    miniPlayer={{ onEnter: () => void miniPlayer.enter(), available: miniPlayer.available }}
                    visible={visible}
                    frameCapture={
                        video
                            ? {
                                  busy: setThumbnail.isPending,
                                  unavailable:
                                      tools.data?.ffmpeg === false ? "Needs ffmpeg to capture frames" : undefined,
                                  onCapture: () =>
                                      setThumbnail.mutate({
                                          video,
                                          positionSeconds: videoRef.current?.currentTime ?? playback.currentTime,
                                      }),
                              }
                            : undefined
                    }
                />
            )}
        </div>
    );
}

/**
 * Entering or leaving the mini player swaps the controls, taking away the button that did it: focus then goes to the
 * stage, from where `Tab` reaches the new controls. Not to a button, whose tooltip would open and take the next Esc.
 */
function useFocusAcrossMiniPlayer(mini: boolean, stage: RefObject<HTMLElement | null>) {
    const wasMini = useRef(mini);
    useEffect(() => {
        if (wasMini.current !== mini) {
            wasMini.current = mini;
            const focused = document.activeElement;
            if (focused === null || focused === document.body) {
                stage.current?.focus({ preventScroll: true });
            }
        }
    }, [mini, stage]);
}
