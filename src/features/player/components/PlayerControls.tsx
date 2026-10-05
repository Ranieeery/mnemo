import {
    Maximize,
    Minimize,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Subtitles,
    Volume1,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
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
} from "../../../shared/ui";
import type { PlaybackState } from "../hooks/usePlayback";
import { playerPreferences, SPEEDS, usePlayerStore } from "../store";

type PlayerControlsProps = {
    playback: PlaybackState & {
        togglePlay: () => void;
        seekTo: (seconds: number) => void;
        seekBy: (seconds: number) => void;
    };
    hasSubtitles: boolean;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    visible: boolean;
};

export function PlayerControls({
    playback,
    hasSubtitles,
    isFullscreen,
    onToggleFullscreen,
    visible,
}: PlayerControlsProps) {
    const { volume, muted, speed, subtitlesEnabled } = usePlayerStore(
        useShallow(({ volume, muted, speed, subtitlesEnabled }) => ({ volume, muted, speed, subtitlesEnabled }))
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
            />
            <div className="flex items-center gap-1">
                <IconButton
                    label="Back 10 seconds"
                    shortcut="J"
                    icon={<RotateCcw />}
                    variant="overlay"
                    onClick={() => playback.seekBy(-10)}
                />
                <IconButton
                    label={playback.playing ? "Pause" : "Play"}
                    shortcut="K"
                    icon={playback.playing ? <Pause /> : <Play />}
                    variant="overlay"
                    size="lg"
                    onClick={playback.togglePlay}
                />
                <IconButton
                    label="Forward 10 seconds"
                    shortcut="L"
                    icon={<RotateCw />}
                    variant="overlay"
                    onClick={() => playback.seekBy(10)}
                />
                <IconButton
                    label={muted ? "Unmute" : "Mute"}
                    shortcut="M"
                    icon={<VolumeIcon />}
                    variant="overlay"
                    onClick={playerPreferences.toggleMute}
                />
                <Slider
                    label="Volume"
                    value={Math.round(audible * 100)}
                    onValueChange={(value) => playerPreferences.setVolume(value / 100)}
                    valueText={`${Math.round(audible * 100)}%`}
                    className="w-24"
                />
                <span className="ml-3 text-small text-text tabular-nums">
                    {formatDuration(playback.currentTime)} / {formatDuration(playback.duration)}
                </span>

                <div className="ml-auto flex items-center gap-1">
                    <IconButton
                        label={hasSubtitles ? "Subtitles" : "No subtitles for this video"}
                        shortcut={hasSubtitles ? "C" : undefined}
                        icon={<Subtitles />}
                        variant="overlay"
                        pressed={hasSubtitles ? subtitlesEnabled : undefined}
                        className={cx(hasSubtitles && subtitlesEnabled && "bg-surface-hover/60")}
                        disabled={!hasSubtitles}
                        onClick={playerPreferences.toggleSubtitles}
                    />
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
                    <IconButton
                        label={isFullscreen ? "Exit full screen" : "Full screen"}
                        shortcut="F"
                        icon={isFullscreen ? <Minimize /> : <Maximize />}
                        variant="overlay"
                        onClick={onToggleFullscreen}
                    />
                </div>
            </div>
        </div>
    );
}
