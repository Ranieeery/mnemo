import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SUBTITLE_STYLE, type HomeData, type SubtitleStyle } from "../../shared/ipc/bindings";
import { videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { SubtitleStyleSection } from "./components/SubtitleStyleSection";

const emptyHome: HomeData = { continueWatching: [], recentlyWatched: [], suggestions: [], folderPreviews: [] };

function isStyle(value: unknown): value is SubtitleStyle {
    return typeof value === "object" && value !== null && "size" in value;
}

function renderSection({ fails = false, home = emptyHome }: { fails?: boolean; home?: HomeData } = {}) {
    let stored: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE };
    const calls = mockCommands({
        get_home: home,
        get_subtitle_style: () => stored,
        update_subtitle_style: ({ style }: Record<string, unknown>) => {
            if (fails) {
                throw commandError("database", "database is locked");
            }
            if (isStyle(style)) {
                stored = style;
            }
            return stored;
        },
    });
    const saved = () => callsOf(calls, "update_subtitle_style").at(-1)?.style;
    return { calls, saved, ...renderScreen(<SubtitleStyleSection />) };
}

/** The sample line in the preview. */
async function sample() {
    const preview = await screen.findByRole("img", { name: /Subtitle preview/ });
    const text = within(preview).getByText(/right back/);
    return { preview, text };
}

describe("SubtitleStyleSection", () => {
    it("previews the current style and saves a new color at once", async () => {
        const { user, saved } = renderSection();
        const { text } = await sample();
        expect(text).toHaveStyle({ color: "var(--color-subtitle-white)" });

        await user.click(screen.getByRole("radio", { name: "Yellow" }));
        await waitFor(() => expect(saved()).toEqual({ ...DEFAULT_SUBTITLE_STYLE, color: "yellow" }));
        expect((await sample()).text).toHaveStyle({ color: "var(--color-subtitle-yellow)" });
        expect(screen.getByRole("radio", { name: "Yellow" })).toBeChecked();
    });

    it("turns the background off and disables its opacity", async () => {
        const { user, saved } = renderSection();
        await sample();
        await user.click(screen.getByRole("switch", { name: "Background" }));
        await waitFor(() => expect(saved()).toMatchObject({ background: false }));
        expect(screen.getByRole("slider", { name: "Background opacity" })).toHaveAttribute("data-disabled");
        expect((await sample()).text.style.backgroundColor).toBe("transparent");
    });

    it("saves a slider when it is released and other choices on click", async () => {
        const { user, saved } = renderSection();
        await sample();
        screen.getByRole("slider", { name: "Subtitle size" }).focus();
        await user.keyboard("{ArrowRight}");
        await waitFor(() => expect(saved()).toMatchObject({ size: 110 }));

        await user.click(screen.getByRole("button", { name: "Outline" }));
        await waitFor(() => expect(saved()).toMatchObject({ edge: "outline" }));
        await user.click(screen.getByRole("button", { name: "Serif" }));
        await waitFor(() => expect(saved()).toMatchObject({ font: "serif" }));

        await user.click(screen.getByRole("button", { name: "Restore default style" }));
        await waitFor(() => expect(saved()).toEqual(DEFAULT_SUBTITLE_STYLE));
    });

    it("previews over half dark, half bright by default, or another background", async () => {
        const { user } = renderSection();
        await sample();
        expect(
            screen.getByRole("img", { name: "Subtitle preview over a half dark, half bright background" })
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Bright" }));
        expect(screen.getByRole("img", { name: "Subtitle preview over a bright background" })).toBeInTheDocument();
        // Without thumbnails in the library there is no frame to offer.
        expect(screen.queryByRole("button", { name: "From your library" })).not.toBeInTheDocument();
    });

    it("previews over a frame from the library", async () => {
        const watched = videoFixture({ id: 3, thumbnailPath: "C:/thumbs/pilot.jpg" });
        const { user } = renderSection({ home: { ...emptyHome, recentlyWatched: [watched] } });
        await sample();
        await user.click(await screen.findByRole("button", { name: "From your library" }));
        const preview = screen.getByRole("img", { name: "Subtitle preview over a frame from your library background" });
        expect(preview.querySelector("img")).toHaveAttribute("src", expect.stringContaining("pilot.jpg"));
    });

    it("lets the sample text be changed", async () => {
        const { user } = renderSection();
        await sample();
        const field = screen.getByRole("textbox", { name: "Preview text" });
        await user.clear(field);
        await user.type(field, "Where is everybody?");
        const preview = screen.getByRole("img", { name: /Subtitle preview/ });
        expect(within(preview).getByText("Where is everybody?")).toBeInTheDocument();
    });

    it("goes back to the saved style when saving fails", async () => {
        const { user } = renderSection({ fails: true });
        await sample();
        await user.click(screen.getByRole("radio", { name: "Cyan" }));
        expect(await screen.findByText("Could not save the subtitle style")).toBeInTheDocument();
        expect((await sample()).text).toHaveStyle({ color: "var(--color-subtitle-white)" });
    });
});
