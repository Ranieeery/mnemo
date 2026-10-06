import type { SubtitleStyle } from "../ipc/bindings";
import { subtitleCss } from "../lib/subtitleStyle";

type SubtitleLineProps = {
    text: string;
    style: SubtitleStyle;
    /** Moves the line above the player's controls while they show. */
    aboveControls?: boolean;
};

/**
 * A subtitle drawn over a video in the user's style. Used by the player and by the preview in Settings, so both look
 * the same. Place it inside a positioned size container (`relative @container`) covering the video.
 */
export function SubtitleLine({ text, style, aboveControls = false }: SubtitleLineProps) {
    const css = subtitleCss(style, aboveControls);
    return (
        <div
            className="pointer-events-none absolute inset-x-0 flex justify-center px-[4%] transition-[bottom] duration-(--duration-base) ease-standard"
            style={css.box}
        >
            <p className="max-w-full rounded-control text-center whitespace-pre-line" style={css.text}>
                {text}
            </p>
        </div>
    );
}
