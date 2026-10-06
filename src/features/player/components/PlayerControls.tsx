import {
    ImagePlus,
    Maximize,
    Minimize,
    Pause,
    Play,
    RectangleHorizontal,
    RotateCcw,
    RotateCw,
    Volume1,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { shortcutHint } from "../../../shared/lib/keyboard";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    IconButton,
    Slider,
    Spinner,
} from "../../../shared/ui";
import type { AudioTracksState } from "../hooks/useAudioTracks";
import type { PlaybackState } from "../hooks/usePlayback";
import type { SubtitlesState } from "../hooks/useSubtitles";
import { playerPreferences, SPEEDS, usePlayerStore } from "../store";
import { AudioTrackMenu } from "./AudioTrackMenu";
import { SubtitlesMenu } from "./SubtitlesMenu";

type PlayerControlsProps = {
    playback: PlaybackState & {
        togglePlay: () => void;
        seekTo: (seconds: number) => void;
        seekBy: (seconds: number) => void;
    };
    /** The video file, for handing it to the default player. */
    path: string;
    subtitles: SubtitlesState;
    audio: AudioTracksState;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    visible: boolean;
    /** Makes the current frame the video's thumbnail; absent for videos that are not in the library. */
    frameCapture?: FrameCapture;
};

type FrameCapture = {
    onCapture: () => void;
    busy: boolean;
    /** Why the frame cannot be captured, e.g. ffmpeg is missing. */
    unavailable?: string;
};

export function PlayerControls({
    playback,
    path,
    subtitles,
    audio,
    isFullscreen,
    onToggleFullscreen,
    visible,
    frameCapture,
}: PlayerControlsProps) {
    const shortcuts = useKeyboardShortcuts();
    const { volume, muted, speed, subtitlesEnabled, theater } = usePlayerStore(
        useShallow(({ volume, muted, speed, subtitlesEnabled, theater }) => ({
            volume,
            muted,
            speed,
            subtitlesEnabled,
            theater,
        }))
    );
    const audible = muted ? 0 : volume;
    const VolumeIcon = audible === 0 ? VolumeX : audible < 0.5 ? Volume1 : Volume2;

    return (
        <div
            className={cx(
                "absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-scrim to-transparent px-4 pt-10 pb-3",
                "transition-opacity duration-(--duration-base) ease-standard",
                visible ? "opacity-100" : "pointer-events-none opacity-0"
            )}
        >
            <Slider
                label="Seek"
                value={playback.currentTime}
                max={playback.duration || 1}
                step={1}
                onValueChange={playback.seekTo}
                valueText={`${formatDuration(playback.currentTime)} of ${formatDuration(playback.duration)}`}
                className="w-full"
            />
            <div className="flex items-center gap-1">
                <IconButton
                    label="Back 10 seconds"
                    shortcut={shortcutHint(shortcuts.seekBack10)}
                    icon={<RotateCcw />}
                    variant="overlay"
                    onClick={() => playback.seekBy(-10)}
                />
                <IconButton
                    label={playback.playing ? "Pause" : "Play"}
                    shortcut={shortcutHint(shortcuts.playPause)}
                    icon={playback.playing ? <Pause /> : <Play />}
                    variant="overlay"
                    size="lg"
                    onClick={playback.togglePlay}
                />
                <IconButton
                    label="Forward 10 seconds"
                    shortcut={shortcutHint(shortcuts.seekForward10)}
                    icon={<RotateCw />}
                    variant="overlay"
                    onClick={() => playback.seekBy(10)}
                />
                {/* Like YouTube: the volume slider slides out while the mute button is hovered or focused. */}
                <div className="group/volume flex items-center">
                    <IconButton
                        label={muted ? "Unmute" : "Mute"}
                        shortcut={shortcutHint(shortcuts.mute)}
                        icon={<VolumeIcon />}
                        variant="overlay"
                        onClick={playerPreferences.toggleMute}
                    />
                    {/* No overflow clipping, so the thumb sits at the ends exactly like the seek bar's. */}
                    <div
                        className={cx(
                            "invisible w-0 opacity-0 transition-[width,opacity] duration-(--duration-base) ease-standard",
                            "group-hover/volume:visible group-hover/volume:w-20 group-hover/volume:px-1 group-hover/volume:opacity-100",
                            "group-focus-within/volume:visible group-focus-within/volume:w-20 group-focus-within/volume:px-1 group-focus-within/volume:opacity-100"
                        )}
                    >
                        <Slider
                            label="Volume"
                            size="compact"
                            value={Math.round(audible * 100)}
                            onValueChange={(value) => playerPreferences.setVolume(value / 100)}
                            valueText={`${Math.round(audible * 100)}%`}
                            className="w-full"
                        />
                    </div>
                </div>
                <span className="ml-3 text-small text-text tabular-nums">
                    {formatDuration(playback.currentTime)} / {formatDuration(playback.duration)}
                </span>

                <div className="ml-auto flex items-center gap-1">
                    {frameCapture && (
                        <IconButton
                            label={frameCapture.unavailable ?? "Use frame as thumbnail"}
                            icon={frameCapture.busy ? <Spinner /> : <ImagePlus />}
                            variant="overlay"
                            aria-busy={frameCapture.busy || undefined}
                            disabled={frameCapture.busy || frameCapture.unavailable !== undefined}
                            onClick={frameCapture.onCapture}
                        />
                    )}
                    <AudioTrackMenu path={path} audio={audio} />
                    <SubtitlesMenu path={path} subtitles={subtitles} enabled={subtitlesEnabled} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-text tabular-nums"
                                aria-label={`Playback speed ${speed}×`}
                            >
                                {speed}×
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="top">
                            <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={String(speed)}
                                onValueChange={(value) => playerPreferences.setSpeed(Number(value))}
                            >
                                {SPEEDS.map((option) => (
                                    <DropdownMenuRadioItem key={option} value={String(option)}>
                                        {option}×
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {/* Like YouTube, theater mode is a page layout, so it has no meaning in full screen. */}
                    {!isFullscreen && (
                        <IconButton
                            label="Theater mode"
                            shortcut={shortcutHint(shortcuts.theater)}
                            icon={<RectangleHorizontal />}
                            variant="overlay"
                            pressed={theater}
                            className={cx(theater && "bg-surface-hover/60")}
                            onClick={playerPreferences.toggleTheater}
                        />
                    )}
                    <IconButton
                        label={isFullscreen ? "Exit full screen" : "Full screen"}
                        shortcut={shortcutHint(shortcuts.fullscreen)}
                        icon={isFullscreen ? <Minimize /> : <Maximize />}
                        variant="overlay"
                        onClick={onToggleFullscreen}
                    />
                </div>
            </div>
        </div>
    );
}
