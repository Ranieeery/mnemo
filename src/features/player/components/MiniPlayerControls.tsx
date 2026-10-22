import { Maximize2, Pause, Play, X } from "lucide-react";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { shortcutHint } from "../../../shared/lib/keyboard";
import { IconButton, Slider } from "../../../shared/ui";
import type { PlaybackState } from "../hooks/usePlayback";

type MiniPlayerControlsProps = {
    playback: PlaybackState & { togglePlay: () => void; seekTo: (seconds: number) => void };
    visible: boolean;
    onExpand: () => void;
    onClose: () => void;
};

/** The few controls the mini player has room for; every player key still works. */
export function MiniPlayerControls({ playback, visible, onExpand, onClose }: MiniPlayerControlsProps) {
    const shortcuts = useKeyboardShortcuts();

    return (
        <div
            className={cx(
                "absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-scrim to-transparent px-2 pt-6 pb-1",
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
                    label={playback.playing ? "Pause" : "Play"}
                    shortcut={shortcutHint(shortcuts.playPause)}
                    icon={playback.playing ? <Pause /> : <Play />}
                    variant="overlay"
                    size="sm"
                    onClick={playback.togglePlay}
                />
                <span className="ml-1 truncate text-caption text-text tabular-nums">
                    {formatDuration(playback.currentTime)} / {formatDuration(playback.duration)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                    <IconButton
                        label="Expand"
                        shortcut={shortcutHint(shortcuts.miniPlayer) ?? "Esc"}
                        icon={<Maximize2 />}
                        variant="overlay"
                        size="sm"
                        onClick={onExpand}
                    />
                    <IconButton label="Close player" icon={<X />} variant="overlay" size="sm" onClick={onClose} />
                </div>
            </div>
        </div>
    );
}
