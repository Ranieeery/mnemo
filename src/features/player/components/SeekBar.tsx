import { useRef, useState } from "react";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { Slider } from "../../../shared/ui";
import { pointerFraction } from "../lib/seekPreview";

type SeekBarProps = {
    currentTime: number;
    duration: number;
    onSeek: (seconds: number) => void;
};

/**
 * The seek bar, with the time under the pointer shown above it while hovering, so a jump can be aimed before the
 * click. The keyboard already hears the time through the slider's value text, so the preview is for the pointer only.
 */
export function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState<number | null>(null);

    const follow = (clientX: number) => {
        const rect = barRef.current?.getBoundingClientRect();
        setHovered(rect && duration > 0 ? pointerFraction(clientX, rect.left, rect.width) : null);
    };

    return (
        <div
            ref={barRef}
            className="relative"
            onPointerMove={(event) => follow(event.clientX)}
            onPointerLeave={() => setHovered(null)}
        >
            {hovered !== null && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-badge bg-scrim px-1.5 py-0.5 text-caption font-medium text-text tabular-nums"
                    style={{ left: `${hovered * 100}%` }}
                >
                    {formatDuration(hovered * duration)}
                </span>
            )}
            <Slider
                label="Seek"
                value={currentTime}
                max={duration || 1}
                step={1}
                onValueChange={onSeek}
                valueText={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
                className="w-full"
            />
        </div>
    );
}
