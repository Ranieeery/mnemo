import type { CSSProperties } from "react";
import type { SubtitleColor, SubtitleEdge, SubtitleFont, SubtitleStyle } from "../ipc/bindings";

/** Every subtitle color, in the order Settings offers them. Each has a `--color-subtitle-*` token. */
export const SUBTITLE_COLORS: readonly SubtitleColor[] = ["white", "yellow", "green", "cyan", "magenta"];

const fontFamilies: Record<SubtitleFont, string> = {
    app: "var(--font-sans)",
    sans: "var(--font-system)",
    serif: "var(--font-serif)",
    mono: "var(--font-mono)",
};

const edges: Record<SubtitleEdge, string> = {
    none: "none",
    shadow: "var(--subtitle-edge-shadow)",
    outline: "var(--subtitle-edge-outline)",
};

/** At 100%, the text is 2% of the video's width: about 18px in the window, larger in full screen. */
const SIZE_AT_100 = 2;
/** The controls bar is this tall; subtitles move above it while it shows. */
const CONTROLS_CLEARANCE = "4.5rem";

/**
 * Turns a subtitle style into CSS for the line (`box`, positioned from the bottom of the video) and its text. Sizes
 * use `cqw`, so the element holding the video must be a size container (`@container`).
 */
export function subtitleCss(style: SubtitleStyle, aboveControls: boolean): { box: CSSProperties; text: CSSProperties } {
    return {
        box: { bottom: `calc(${style.position}% + ${aboveControls ? CONTROLS_CLEARANCE : "0px"})` },
        text: {
            fontSize: `max(0.75rem, ${(style.size / 100) * SIZE_AT_100}cqw)`,
            lineHeight: 1.35,
            fontFamily: fontFamilies[style.font],
            color: `var(--color-subtitle-${style.color})`,
            backgroundColor: style.background
                ? `color-mix(in srgb, var(--color-backdrop) ${style.backgroundOpacity}%, transparent)`
                : "transparent",
            padding: style.background ? "0.15em 0.5em" : 0,
            textShadow: edges[style.edge],
        },
    };
}
