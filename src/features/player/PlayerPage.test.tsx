import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    type AudioTrack,
    DEFAULT_KEYBOARD_SHORTCUTS,
    DEFAULT_PLAYER_PREFERENCES,
    type PlayerPreferences,
    type SubtitleTrack,
    type Video,
    type VideoEntry,
} from "../../shared/ipc/bindings";
import type { ShortcutKeys } from "../../shared/lib/keyboard";
import { entryFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { loadMetadata, playToEnd } from "../../shared/test/media";
import { renderScreen } from "../../shared/test/render";
import { PlayerPage } from "./components/PlayerPage";
import { usePlayerStore } from "./store";

const SHOW = "D:\\Videos\\Show";
const current = videoFixture({ id: 1, title: "Pilot", filePath: `${SHOW}\\Ep 1.mkv`, watchProgressSeconds: 300 });
const next = videoFixture({ id: 2, title: "The Second One", filePath: `${SHOW}\\Ep 2.mkv` });
const NL = String.fromCharCode(10);
const SUBTITLE = "1\n00:00:00,500 --> 00:00:10,000\nHello there\n";

type Options = {
    video?: Video | null;
    subtitle?: boolean;
    ffmpeg?: boolean;
    thumbnailFails?: boolean;
    /** What the backend saved last time; `null` makes loading them fail. */
    preferences?: PlayerPreferences | null;
    /** Subtitle tracks inside the file. */
    tracks?: SubtitleTrack[];
    /** Audio tracks inside the file. */
    audio?: AudioTrack[];
    /** The configured keyboard shortcuts. */
    shortcuts?: ShortcutKeys;
    extractFails?: boolean;
};

function renderPlayer({
    video = current,
    subtitle = false,
    ffmpeg = true,
    thumbnailFails = false,
    preferences = DEFAULT_PLAYER_PREFERENCES,
    tracks = [],
    audio = [],
    shortcuts = DEFAULT_KEYBOARD_SHORTCUTS,
    extractFails = false,
}: Options = {}) {
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
        media_tools_status: { ffmpeg, ffprobe: ffmpeg },
        get_player_preferences: () => {
            if (preferences === null) {
                throw commandError("database", "database is locked");
            }
            return preferences;
        },
        update_player_preferences: ({ preferences: saved }: Record<string, unknown>) => saved,
        open_externally: null,
        get_keyboard_shortcuts: shortcuts,
        list_media_tracks: { audio, subtitles: tracks },
        extract_subtitle: ({ index }: Record<string, unknown>) => {
            if (extractFails) {
                throw commandError("mediaProcessFailed", "ffmpeg failed: invalid data");
            }
            // ffmpeg writes WebVTT times without hours.
            return { format: "vtt", content: `WEBVTT${NL}${NL}00:00.500 --> 00:10.000${NL}From track ${index}${NL}` };
        },
        set_video_thumbnail: () => {
            if (thumbnailFails) {
                throw commandError("mediaProcessFailed", "ffmpeg failed: no frame");
            }
            return stored && { ...stored, thumbnailPath: "new.jpg" };
        },
        save_progress: ({ positionSeconds }: Record<string, unknown>) => ({
            ...current,
            watchProgressSeconds: positionSeconds,
        }),
    });
    const rendered = renderScreen(<PlayerPage path={path} />, ["/", `/watch?path=${encodeURIComponent(path)}`]);
    return { ...rendered, calls };
}

function audioTrack(index: number, codec: string, language: string): AudioTrack {
    return { index, language, title: null, codec, channels: 2, isDefault: index === 0 };
}

/** A player's `AudioTrackList`: indexed tracks, a length and events. */
class FakeAudioTrackList extends EventTarget {
    [index: number]: { language: string; enabled: boolean };
    readonly tracks: { language: string; enabled: boolean }[];

    constructor(languages: string[]) {
        super();
        this.tracks = languages.map((language, index) => ({ language, enabled: index === 0 }));
        this.tracks.forEach((track, index) => {
            this[index] = track;
        });
    }

    get length() {
        return this.tracks.length;
    }
}

/** Gives every video an `audioTracks` list like a player's, with the first track playing. */
function givePlayerAudioTracks(languages: string[]) {
    const list = new FakeAudioTrackList(languages);
    Object.defineProperty(HTMLMediaElement.prototype, "audioTracks", { configurable: true, get: () => list });
    return list;
}

function embeddedTrack(index: number, language: string): SubtitleTrack {
    return { index, language, title: null, codec: "subrip", isDefault: false, isForced: false, isText: true };
}

function imageTrack(index: number): SubtitleTrack {
    return { ...embeddedTrack(index, "jpn"), codec: "hdmv_pgs_subtitle", isText: false };
}

/** The video element once loaded, positioned at `seconds`. */
async function playingAt(seconds: number): Promise<HTMLVideoElement> {
    const element = await videoElement();
    act(() => loadMetadata(element, 1500));
    act(() => {
        element.currentTime = seconds;
    });
    return element;
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
        // A new session: the preferences have not been loaded yet.
        usePlayerStore.setState({ ...DEFAULT_PLAYER_PREFERENCES, hydrated: false });
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

    it("shows a subtitle track from inside the file, chosen in the menu", async () => {
        const { user, calls } = renderPlayer({
            subtitle: true,
            tracks: [embeddedTrack(0, "eng"), embeddedTrack(1, "por"), imageTrack(2)],
        });
        await playingAt(1);
        expect(await screen.findByText("Hello there")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Subtitles" }));
        expect(await screen.findByRole("menuitemradio", { name: "Subtitle file" })).toBeChecked();
        expect(screen.getByRole("menuitemradio", { name: /Japanese · PGS/ })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", { name: "Open in default player" })).toBeInTheDocument();
        await user.click(screen.getByRole("menuitemradio", { name: "Portuguese · SubRip" }));

        expect(await screen.findByText("From track 1")).toBeInTheDocument();
        expect(callsOf(calls, "extract_subtitle")).toEqual([{ path: current.filePath, index: 1 }]);
    });

    it("plays the default embedded track when there is no subtitle file", async () => {
        const { calls } = renderPlayer({
            tracks: [embeddedTrack(0, "eng"), { ...embeddedTrack(1, "jpn"), isDefault: true }],
        });
        await playingAt(1);
        expect(await screen.findByText("From track 1")).toBeInTheDocument();
        expect(callsOf(calls, "extract_subtitle")).toHaveLength(1);
    });

    it("does not extract subtitles while they are off", async () => {
        const { calls } = renderPlayer({
            tracks: [embeddedTrack(0, "eng")],
            preferences: { ...DEFAULT_PLAYER_PREFERENCES, subtitlesEnabled: false },
        });
        await playingAt(1);
        await waitFor(() => expect(callsOf(calls, "list_media_tracks")).toHaveLength(1));
        expect(callsOf(calls, "extract_subtitle")).toEqual([]);
    });

    it("goes back to the previous subtitles when a track cannot be extracted", async () => {
        const { user } = renderPlayer({ subtitle: true, tracks: [embeddedTrack(0, "eng")], extractFails: true });
        await playingAt(1);
        await user.click(await screen.findByRole("button", { name: "Subtitles" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "English · SubRip" }));

        expect(await screen.findByText("Could not load the subtitles")).toBeInTheDocument();
        expect(screen.getByText("ffmpeg failed: invalid data")).toBeInTheDocument();
        expect(await screen.findByText("Hello there")).toBeInTheDocument();
    });

    it("turns subtitles off from the menu", async () => {
        const { user } = renderPlayer({ subtitle: true });
        await playingAt(1);
        expect(await screen.findByText("Hello there")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Subtitles" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Off" }));
        expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
        expect(usePlayerStore.getState().subtitlesEnabled).toBe(false);
    });

    describe("audio tracks", () => {
        afterEach(() => {
            Reflect.deleteProperty(HTMLMediaElement.prototype, "audioTracks");
        });

        it("switches between the tracks the player can play", async () => {
            const player = givePlayerAudioTracks(["eng", "jpn"]);
            const { user } = renderPlayer({ audio: [audioTrack(0, "aac", "eng"), audioTrack(1, "aac", "jpn")] });
            await videoElement();

            await user.click(await screen.findByRole("button", { name: "Audio track" }));
            expect(await screen.findByRole("menuitemradio", { name: "English · AAC · Stereo" })).toBeChecked();
            await user.click(screen.getByRole("menuitemradio", { name: "Japanese · AAC · Stereo" }));

            expect(player.tracks.map((track) => track.enabled)).toEqual([false, true]);
            await user.click(screen.getByRole("button", { name: "Audio track" }));
            expect(await screen.findByRole("menuitemradio", { name: "Japanese · AAC · Stereo" })).toBeChecked();
        });

        it("explains tracks the player left out, like AC3 in WebView2", async () => {
            givePlayerAudioTracks(["jpn"]);
            const { user } = renderPlayer({ audio: [audioTrack(0, "ac3", "eng"), audioTrack(1, "aac", "jpn")] });
            await videoElement();

            await user.click(await screen.findByRole("button", { name: "Audio track" }));
            const ac3 = await screen.findByRole("menuitemradio", { name: /English · AC3/ });
            expect(ac3).toHaveAttribute("aria-disabled", "true");
            expect(ac3).toHaveTextContent("Format not supported here");
            expect(screen.getByRole("menuitemradio", { name: "Japanese · AAC · Stereo" })).toBeChecked();
            expect(screen.getByRole("menuitem", { name: "Open in default player" })).toBeInTheDocument();
        });

        it("lists the tracks but points to the default player when switching is not possible", async () => {
            const { user } = renderPlayer({ audio: [audioTrack(0, "aac", "eng"), audioTrack(1, "aac", "jpn")] });
            await videoElement();

            await user.click(await screen.findByRole("button", { name: "Audio track" }));
            expect(await screen.findByText(/can't switch audio tracks/)).toBeInTheDocument();
            for (const item of screen.getAllByRole("menuitemradio")) {
                expect(item).toHaveAttribute("aria-disabled", "true");
            }
            expect(screen.getByRole("menuitem", { name: "Open in default player" })).toBeInTheDocument();
        });

        it("warns that the video has no sound when the player can decode none of its audio", async () => {
            // WebView2 with two E-AC3 tracks: it lists none of them and plays silently.
            givePlayerAudioTracks([]);
            const { user } = renderPlayer({
                audio: [{ ...audioTrack(0, "eac3", "por"), channels: 6 }, audioTrack(1, "eac3", "eng")],
            });
            await playingAt(1);

            const notice = await screen.findByRole("alert");
            expect(notice).toHaveTextContent("No sound in the built-in player");
            expect(notice).toHaveTextContent("It can't play E-AC3 audio. The default player can.");

            await user.click(screen.getByRole("button", { name: "Audio track" }));
            expect(
                await screen.findByText(/can't play E-AC3 audio, so the video has no sound here/)
            ).toBeInTheDocument();
            expect(screen.getByRole("menuitemradio", { name: /Portuguese · E-AC3 · 5\.1/ })).toHaveAttribute(
                "aria-disabled",
                "true"
            );
        });

        it("opens the video in the default player from the notice, pausing it here", async () => {
            givePlayerAudioTracks([]);
            const { user, calls } = renderPlayer({ audio: [audioTrack(0, "eac3", "por")] });
            const element = await playingAt(1);
            await act(() => element.play());

            const notice = await screen.findByRole("alert");
            await user.click(within(notice).getByRole("button", { name: "Open in default player" }));
            expect(element.paused).toBe(true);
            await waitFor(() => expect(callsOf(calls, "open_externally")).toEqual([{ path: current.filePath }]));
        });

        it("can be dismissed to keep watching without sound", async () => {
            givePlayerAudioTracks([]);
            const { user } = renderPlayer({ audio: [audioTrack(0, "eac3", "por")] });
            await playingAt(1);
            await user.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Dismiss" }));
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        });

        it("does not warn before the player has read the file", async () => {
            givePlayerAudioTracks([]);
            const { calls } = renderPlayer({ audio: [audioTrack(0, "eac3", "por")] });
            await videoElement();
            await waitFor(() => expect(callsOf(calls, "list_media_tracks")).toHaveLength(1));
            expect(screen.queryByText("No sound in the built-in player")).not.toBeInTheDocument();
        });

        it("has no menu with a single track", async () => {
            const { calls } = renderPlayer({ audio: [audioTrack(0, "aac", "eng")] });
            await videoElement();
            await waitFor(() => expect(callsOf(calls, "list_media_tracks")).toHaveLength(1));
            expect(screen.queryByRole("button", { name: "Audio track" })).not.toBeInTheDocument();
        });
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

    it("starts with the preferences saved last time", async () => {
        renderPlayer({
            subtitle: true,
            preferences: { volume: 0.4, muted: true, speed: 1.5, subtitlesEnabled: false, theater: true },
        });
        const element = await videoElement();
        expect(element).toMatchObject({ volume: 0.4, muted: true, playbackRate: 1.5 });
        act(() => loadMetadata(element, 1500));
        act(() => {
            element.currentTime = 1;
        });
        // Subtitles were left off: the file's cue is not shown.
        expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "true");
    });

    it("saves a burst of changes once, after a short pause", async () => {
        const { user, calls } = renderPlayer();
        await videoElement();
        await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}]");

        await waitFor(() => expect(callsOf(calls, "update_player_preferences")).toHaveLength(1));
        expect(callsOf(calls, "update_player_preferences")[0]).toEqual({
            preferences: { ...DEFAULT_PLAYER_PREFERENCES, volume: 0.85, speed: 1.25 },
        });
    });

    it("saves pending changes when the player closes, and the next video keeps them", async () => {
        const first = renderPlayer();
        await videoElement();
        await first.user.keyboard("m");
        cleanup();
        expect(callsOf(first.calls, "update_player_preferences")).toEqual([
            { preferences: { ...DEFAULT_PLAYER_PREFERENCES, muted: true } },
        ]);

        // Another video in the same session: no reload, same preferences.
        const second = renderPlayer({ video: next });
        const element = await videoElement();
        expect(element.muted).toBe(true);
        expect(callsOf(second.calls, "get_player_preferences")).toEqual([]);
    });

    it("plays with the default preferences when the saved ones cannot be loaded", async () => {
        renderPlayer({ preferences: null });
        expect(await screen.findByText("Could not load player preferences")).toBeInTheDocument();
        const element = await videoElement();
        expect(element).toMatchObject({ volume: 1, muted: false, playbackRate: 1 });
    });

    it("makes the current frame the video's thumbnail", async () => {
        const { user, calls } = renderPlayer();
        const element = await videoElement();
        loadMetadata(element, 1500);
        element.currentTime = 754.2;

        await user.click(screen.getByRole("button", { name: "Use frame as thumbnail" }));
        expect(await screen.findByText("Thumbnail updated")).toBeInTheDocument();
        expect(screen.getByText("Frame at 12:34")).toBeInTheDocument();
        expect(callsOf(calls, "set_video_thumbnail")).toEqual([{ id: current.id, positionSeconds: 754.2 }]);
    });

    it("reports a frame that could not be captured", async () => {
        const { user } = renderPlayer({ thumbnailFails: true });
        await videoElement();
        await user.click(screen.getByRole("button", { name: "Use frame as thumbnail" }));
        expect(await screen.findByText("Could not change the thumbnail")).toBeInTheDocument();
        expect(screen.getByText("ffmpeg failed: no frame")).toBeInTheDocument();
    });

    it("explains that capturing frames needs ffmpeg", async () => {
        renderPlayer({ ffmpeg: false });
        expect(await screen.findByRole("button", { name: "Needs ffmpeg to capture frames" })).toBeDisabled();
    });

    it("follows reassigned keys and shows them in the tooltips", async () => {
        const { user } = renderPlayer({ shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, playPause: ["P"] } });
        const element = await videoElement();
        await act(() => element.play());

        await user.keyboard("k");
        expect(element.paused).toBe(false);
        await user.keyboard("p");
        expect(element.paused).toBe(true);

        await user.hover(screen.getByRole("button", { name: "Play" }));
        expect(await screen.findByRole("tooltip")).toHaveTextContent("PlayP");
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
        // Without a library record there is nothing to give a thumbnail to.
        expect(screen.queryByRole("button", { name: "Use frame as thumbnail" })).not.toBeInTheDocument();
    });
});
