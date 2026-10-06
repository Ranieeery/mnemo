import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Video, VideoEntry } from "../../shared/ipc/bindings";
import { entryFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { loadMetadata, playToEnd } from "../../shared/test/media";
import { renderScreen } from "../../shared/test/render";
import { PlayerPage } from "./components/PlayerPage";
import { playerPreferences, usePlayerStore } from "./store";

const SHOW = "D:\\Videos\\Show";
const current = videoFixture({ id: 1, title: "Pilot", filePath: `${SHOW}\\Ep 1.mkv`, watchProgressSeconds: 300 });
const next = videoFixture({ id: 2, title: "The Second One", filePath: `${SHOW}\\Ep 2.mkv` });
const SUBTITLE = "1\n00:00:00,500 --> 00:00:10,000\nHello there\n";

type Options = { video?: Video | null; subtitle?: boolean };

function renderPlayer({ video = current, subtitle = false }: Options = {}) {
    const path = video?.filePath ?? `${SHOW}\\Raw.mkv`;
    const playlist: VideoEntry[] = video ? [entryFixture(video), entryFixture(next)] : [];
    // The record a real backend would keep, so refetches after a change see it.
    let stored = video;
    const calls = mockCommands({
        get_video: () => stored,
        list_playlist: playlist,
        find_subtitle: subtitle ? { format: "srt", content: SUBTITLE } : null,
        set_watched: ({ watched }: Record<string, unknown>) => {
            stored = stored && { ...stored, isWatched: watched === true };
            return stored;
        },
        save_progress: ({ positionSeconds }: Record<string, unknown>) => ({
            ...current,
            watchProgressSeconds: positionSeconds,
        }),
    });
    const rendered = renderScreen(<PlayerPage path={path} />, ["/", `/watch?path=${encodeURIComponent(path)}`]);
    return { ...rendered, calls };
}

async function videoElement(): Promise<HTMLVideoElement> {
    await screen.findByRole("button", { name: "Play" });
    const element = document.querySelector("video");
    if (!element) {
        throw new Error("no video element");
    }
    return element;
}

describe("PlayerPage", () => {
    beforeEach(() => {
        usePlayerStore.setState({
            volume: 1,
            muted: false,
            speed: 1,
            subtitlesEnabled: true,
            theater: false,
            continuing: false,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resumes from the saved position", async () => {
        // Regression (B1): the legacy player always started at 0.
        renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));

        expect(element.currentTime).toBe(300);
        expect(await screen.findByText("Resumed at 5:00")).toBeInTheDocument();
    });

    it("supports every keyboard shortcut", async () => {
        const requestFullscreen = vi.fn().mockResolvedValue(undefined);
        HTMLElement.prototype.requestFullscreen = requestFullscreen;
        const { user } = renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        element.currentTime = 100;

        await user.keyboard(" ");
        expect(element.paused).toBe(false);
        await user.keyboard("k");
        expect(element.paused).toBe(true);

        await user.keyboard("l");
        expect(element.currentTime).toBe(110);
        await user.keyboard("j");
        expect(element.currentTime).toBe(100);
        await user.keyboard("{ArrowRight}");
        expect(element.currentTime).toBe(105);
        await user.keyboard("{ArrowLeft}");
        expect(element.currentTime).toBe(100);

        await user.keyboard("{ArrowDown}");
        expect(element.volume).toBe(0.95);
        await user.keyboard("{ArrowUp}");
        expect(element.volume).toBe(1);

        await user.keyboard("]");
        expect(element.playbackRate).toBe(1.25);
        // "[[" is how user-event types a literal "[".
        await user.keyboard("[[[[");
        expect(element.playbackRate).toBe(0.75);
        await user.keyboard("{Backspace}");
        expect(element.playbackRate).toBe(1);

        await user.keyboard("m");
        expect(element.muted).toBe(true);
        await user.keyboard("m");
        expect(element.muted).toBe(false);

        await user.keyboard("f");
        expect(requestFullscreen).toHaveBeenCalledOnce();
    });

    it("shows external subtitles and toggles them with C", async () => {
        const { user } = renderPlayer({ subtitle: true });
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        act(() => {
            element.currentTime = 1;
        });

        expect(await screen.findByText("Hello there")).toBeInTheDocument();
        await user.keyboard("c");
        expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
        await user.keyboard("c");
        expect(screen.getByText("Hello there")).toBeInTheDocument();
    });

    it("saves progress at most every few seconds while playing, and right away on pause", async () => {
        // Regression (B2): the legacy player saved on every time update.
        const { calls } = renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        await act(() => element.play());
        for (const position of [301, 302, 303, 304]) {
            act(() => {
                element.currentTime = position;
            });
        }
        act(() => element.pause());

        await waitFor(() => expect(callsOf(calls, "save_progress")).toHaveLength(2));
        expect(callsOf(calls, "save_progress")).toEqual([
            { id: 1, positionSeconds: 301, finished: false },
            { id: 1, positionSeconds: 304, finished: false },
        ]);
    });

    it("offers the next video when one ends and plays it on request", async () => {
        const { user, router, calls } = renderPlayer();
        const upNext = await screen.findByRole("button", { name: /The Second One/ });
        // Regression: a fixed full-width thumbnail pushed the title out of the "Up next" rows.
        expect(upNext.firstElementChild).not.toHaveClass("w-full");
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        act(() => playToEnd(element));

        expect(await screen.findByRole("dialog", { name: /Up next in/ })).toHaveTextContent("The Second One");
        expect(callsOf(calls, "save_progress")).toContainEqual({ id: 1, positionSeconds: 1500, finished: true });
        await user.click(screen.getByRole("button", { name: "Play now" }));
        await waitFor(() => expect(router.state.location.search).toEqual({ path: next.filePath }));
    });

    it("shows a toggle that turns green once the video is watched", async () => {
        const { user } = renderPlayer();
        const toggle = await screen.findByRole("button", { name: "Mark as watched" });
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        await user.click(toggle);
        const watched = await screen.findByRole("button", { name: "Watched" });
        expect(watched).toHaveAttribute("aria-pressed", "true");
        expect(watched).toHaveClass("bg-success");
        // Regression: the longer label stays in the layout (hidden), so toggling never resizes the button.
        expect(watched).toHaveTextContent("Mark as watched");
    });

    it("switches to theater mode with the button or T, without reloading the video", async () => {
        const { user } = renderPlayer();
        const element = await videoElement();
        const theater = screen.getByRole("button", { name: "Theater mode" });
        expect(theater).toHaveAttribute("aria-pressed", "false");

        await user.click(theater);
        expect(screen.getByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "true");
        expect(document.querySelector("video")).toBe(element);
        expect(screen.getByRole("complementary", { name: "Up next" })).toBeInTheDocument();

        await user.keyboard("t");
        expect(screen.getByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "false");
        expect(document.querySelector("video")).toBe(element);
    });

    it("keeps theater mode for the next videos", () => {
        playerPreferences.toggleTheater();
        playerPreferences.startVideo();
        expect(usePlayerStore.getState().theater).toBe(true);
    });

    it("closes with Escape, going back to where it was opened from", async () => {
        const { user, router } = renderPlayer();
        await videoElement();
        await user.keyboard("{Escape}");
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    });

    it("plays videos that were not processed yet without saving progress", async () => {
        const { calls } = renderPlayer({ video: null });
        const element = await videoElement();
        act(() => loadMetadata(element, 600));
        await act(() => element.play());
        act(() => {
            element.currentTime = 30;
        });
        act(() => element.pause());

        expect(screen.getByText(/has not been read yet/)).toBeInTheDocument();
        expect(callsOf(calls, "save_progress")).toEqual([]);
    });
});
