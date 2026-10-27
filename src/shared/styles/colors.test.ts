import { describe, expect, it } from "vitest";
import { FOLDER_COLORS } from "../ipc/bindings";
import tokens from "./tokens.css?raw";

/** WCAG relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
    const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
    const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: string, b: string): number {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** The value of `--<name>` in a block of CSS. */
function variable(css: string, name: string): string {
    const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i").exec(css)?.[1];
    if (!value) {
        throw new Error(`--${name} is not defined`);
    }
    return value;
}

const lightBlock = tokens.slice(tokens.indexOf(':root[data-theme="light"]'));
const darkBlock = tokens.slice(0, tokens.indexOf(':root[data-theme="light"]'));

/** Everything text and folder icons are drawn on: the page, the sidebar, dialogs and menus, selected and hovered. */
const SURFACES = ["background", "surface", "surface-raised", "surface-hover"];
const darkSurfaces = SURFACES.map((surface) => variable(darkBlock, `color-${surface}`));
/**
 * There is no light theme yet: these stand for its surfaces, from white to the darkest hover, and must be replaced
 * by its tokens when it exists.
 */
const lightSurfaces = ["#ffffff", "#f7f8fa", "#eff1f4", "#e6e9ee"];

describe("text colors", () => {
    it.each(["text", "text-muted", "text-subtle", "danger-text"])("%s keeps 4.5:1 on every surface", (name) => {
        const color = variable(darkBlock, `color-${name}`);
        for (const surface of darkSurfaces) {
            expect(contrast(color, surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it.each(["accent", "accent-hover"])("accent-foreground keeps 4.5:1 on %s", (name) => {
        const foreground = variable(darkBlock, "color-accent-foreground");
        const fill = variable(darkBlock, `color-${name}`);
        expect(contrast(foreground, fill)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("surfaces", () => {
    it("get lighter as they rise, so layers read without borders", () => {
        const luminances = darkSurfaces.map(luminance);
        expect(luminances).toEqual([...luminances].sort((a, b) => a - b));
        expect(new Set(luminances).size).toBe(luminances.length);
    });
});

describe("indicators and control edges", () => {
    it.each(["accent", "focus-ring"])("%s keeps 3:1 on every surface", (name) => {
        const color = variable(darkBlock, `color-${name}`);
        for (const surface of darkSurfaces) {
            expect(contrast(color, surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
    });

    it("control-border keeps 3:1 on the surfaces fields sit on", () => {
        const color = variable(darkBlock, "color-control-border");
        // Fields sit on the page, cards and dialogs; `surface-hover` is only ever a fill under the pointer.
        for (const surface of darkSurfaces.slice(0, 3)) {
            expect(contrast(color, surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
    });
});

describe("library folder colors", () => {
    it.each(FOLDER_COLORS)("%s keeps 3:1 on every surface in both themes", (color) => {
        const dark = variable(darkBlock, `color-folder-${color}`);
        const light = variable(lightBlock, `color-folder-${color}`);
        for (const surface of darkSurfaces) {
            expect(contrast(dark, surface), `${dark} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
        for (const surface of lightSurfaces) {
            expect(contrast(light, surface), `${light} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
    });

    it("are kept in the build, since they are picked by name at runtime", () => {
        const staticBlock = darkBlock.slice(darkBlock.lastIndexOf("@theme static"));
        for (const color of FOLDER_COLORS) {
            expect(staticBlock).toContain(`--color-folder-${color}:`);
        }
    });
});
