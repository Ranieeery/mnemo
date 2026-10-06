import { describe, expect, it } from "vitest";
import { DEFAULT_SUBTITLE_STYLE, type SubtitleStyle } from "../ipc/bindings";
import tokens from "../styles/tokens.css?raw";
import { SUBTITLE_COLORS, subtitleCss } from "./subtitleStyle";

const defaults: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE };

describe("subtitleCss", () => {
    it("draws the default look: white text on a dark background, near the bottom", () => {
        const { box, text } = subtitleCss(defaults, false);
        expect(box.bottom).toBe("calc(6% + 0px)");
        expect(text).toMatchObject({
            fontSize: "max(0.75rem, 2cqw)",
            fontFamily: "var(--font-sans)",
            color: "var(--color-subtitle-white)",
            backgroundColor: "color-mix(in srgb, var(--color-backdrop) 78%, transparent)",
            textShadow: "var(--subtitle-edge-shadow)",
        });
    });

    it("moves above the controls while they show", () => {
        expect(subtitleCss(defaults, true).box.bottom).toBe("calc(6% + 4.5rem)");
    });

    it("follows every option", () => {
        const { box, text } = subtitleCss(
            {
                size: 150,
                color: "yellow",
                background: false,
                backgroundOpacity: 40,
                edge: "outline",
                position: 20,
                font: "serif",
            },
            false
        );
        expect(box.bottom).toBe("calc(20% + 0px)");
        expect(text).toMatchObject({
            fontSize: "max(0.75rem, 3cqw)",
            fontFamily: "var(--font-serif)",
            color: "var(--color-subtitle-yellow)",
            backgroundColor: "transparent",
            padding: 0,
            textShadow: "var(--subtitle-edge-outline)",
        });
        expect(subtitleCss({ ...defaults, edge: "none", font: "mono" }, false).text).toMatchObject({
            textShadow: "none",
            fontFamily: "var(--font-mono)",
        });
    });
});

describe("subtitle tokens", () => {
    it("declares every color, edge and font in a static theme block", () => {
        // Regression: green and magenta were missing from the build because nothing named them in the source.
        const staticBlock = /@theme static \{([\s\S]*?)\n\}/.exec(tokens)?.[1] ?? "";
        const names = [
            ...SUBTITLE_COLORS.map((color) => `--color-subtitle-${color}`),
            "--subtitle-edge-shadow",
            "--subtitle-edge-outline",
            "--font-system",
            "--font-serif",
            "--font-mono",
        ];
        for (const name of names) {
            expect(staticBlock, name).toContain(`${name}:`);
        }
    });
});
