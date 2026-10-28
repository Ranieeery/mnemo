import { useSearch } from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    type AudioTrack,
    DEFAULT_KEYBOARD_SHORTCUTS,
    DEFAULT_PLAYABLE_COPY_SETTINGS,
    DEFAULT_PLAYER_PREFERENCES,
    DEFAULT_SUBTITLE_STYLE,
    type PlayerPreferences,
    type SubtitleStyle,
    type SubtitleTrack,
    type Video,
    type VideoEntry,
    type WindowMode,
} from "../../shared/ipc/bindings";
import type { ShortcutKeys } from "../../shared/lib/keyboard";
import { entryFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { loadMetadata, playToEnd } from "../../shared/test/media";
import { renderScreen } from "../../shared/test/render";
import { setWindowWidth } from "../../shared/test/window";
import { PlayerPage } from "./components/PlayerPage";
import { usePlayerStore } from "./store";

const SHOW = "D:\\Videos\\Show";
const current = videoFixture({ id: 1, title: "Pilot", filePath: `${SHOW}\\Ep 1.mkv`, watchProgressSeconds: 300 });
const next = videoFixture({ id: 2, title: "The Second One", filePath: `${SHOW}\\Ep 2.mkv` });
const NL = String.fromCharCode(10);
const COPY_PATH = "C:\\AppData\\playable-copies\\0123456789abcdef.mp4";
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
    subtitleStyle?: SubtitleStyle;
    extractFails?: boolean;
    /** Whether the system lets the window stay on top (not under Wayland). */
    onTopSupported?: boolean;
    /** The system refuses to pin the window. */
    pinFails?: boolean;
    /** Restoring the window after the mini player fails. */
    exitMiniFails?: boolean;
    /** Replaces or adds command mocks. */
    commands?: Record<string, unknown>;
};

/** The player as the app's watch route mounts it: a new one for each video. */
function WatchScreen() {
    const { path }: { path?: unknown } = useSearch({ strict: false });
    return typeof path === "string" ? <PlayerPage key={path} path={path} /> : null;
}

function renderPlayer({
    video = current,
    subtitle = false,
    ffmpeg = true,
    thumbnailFails = false,
    preferences = DEFAULT_PLAYER_PREFERENCES,
    tracks = [],
    audio = [],
    shortcuts = DEFAULT_KEYBOARD_SHORTCUTS,
    subtitleStyle = DEFAULT_SUBTITLE_STYLE,
    extractFails = false,
    onTopSupported = true,
    pinFails = false,
    exitMiniFails = false,
    commands = {},
}: Options = {}) {
    const path = video?.filePath ?? `${SHOW}\\Raw.mkv`;
    const playlist: VideoEntry[] = video ? [entryFixture(video), entryFixture(next)] : [];
    // The record a real backend would keep, so refetches after a change see it.
    let stored = video;
    // The window's modes, kept by the backend.
    let windowMode: WindowMode = { pinned: false, mini: false, onTopSupported };
    const changeWindow = (change: Partial<WindowMode>) => {
        windowMode = { ...windowMode, ...change };
        return windowMode;
    };
    const calls = mockCommands({
        get_window_mode: () => windowMode,
        set_window_pinned: ({ pinned }: Record<string, unknown>) => {
            if (pinFails) {
                throw commandError("internal", "the window manager said no");
            }
            return changeWindow({ pinned: pinned === true });
        },
        enter_mini_player: () => changeWindow({ mini: true }),
        exit_mini_player: () => {
            if (exitMiniFails) {
                throw commandError("internal", "the monitor could not be read");
            }
            return changeWindow({ mini: false });
        },
        set_mini_player_aspect: () => windowMode,
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
        get_subtitle_style: subtitleStyle,
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
        get_playable_copy_settings: DEFAULT_PLAYABLE_COPY_SETTINGS,
        update_playable_copy_settings: ({ settings }: Record<string, unknown>) => settings,
        get_playable_copies_usage: { usedBytes: 0, limitBytes: 0, count: 0 },
        check_playable_copy: { container: "MPEG-TS (MPEG-2 Transport Stream)", sizeBytes: 96_000_000, ready: false },
        make_playable_copy: COPY_PATH,
        cancel_playable_copy: null,
        ...commands,
    });
    const rendered = renderScreen(<WatchScreen />, ["/", `/watch?path=${encodeURIComponent(path)}`]);
    /** Changes the record the backend keeps, as reading the video does. */
    const storeVideo = (record: Video) => {
        stored = record;
    };
    return { ...rendered, calls, storeVideo };
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
        expect(await screen.findByText("Resumed at 5:00", { selector: "[role=status] > span" })).toBeInTheDocument();
    });

    it("supports every keyboard shortcut", async () => {
        const requestFullscreen = vi.fn().mockResolvedValue(undefined);
        HTMLElement.prototype.requestFullscreen = requestFullscreen;
        const { user } = renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        act(() => {
            element.currentTime = 100;
        });

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

    it("announces what a key did to screen readers, even the same thing twice", async () => {
        const { user } = renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        const announced = (text: string) => screen.getByText(text, { selector: "[role=status] > span" });

        await user.keyboard("{ArrowDown}");
        expect(announced("Volume 95%")).toBeInTheDocument();
        await user.keyboard("l");
        const first = announced("+10s");
        await user.keyboard("l");
        // A new node, so the live region speaks again.
        expect(announced("+10s")).not.toBe(first);
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

    it("draws subtitles in the saved style", async () => {
        renderPlayer({
            subtitle: true,
            subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, color: "cyan", background: false, font: "mono", position: 20 },
        });
        await playingAt(1);
        const line = await screen.findByText("Hello there");
        expect(line).toHaveStyle({ color: "var(--color-subtitle-cyan)", fontFamily: "var(--font-mono)" });
        expect(line.style.backgroundColor).toBe("transparent");
        // Paused, the controls show, so the line sits above them.
        expect(line.parentElement?.style.bottom).toBe("calc(20% + 4.5rem)");
    });

    it("leads from the subtitles menu to the subtitle style settings", async () => {
        const { user, router } = renderPlayer({ subtitle: true });
        await playingAt(1);
        await user.click(await screen.findByRole("button", { name: "Subtitles" }));
        await user.click(await screen.findByRole("menuitem", { name: "Subtitle style…" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
        expect(router.state.location.search).toEqual({ tab: "playback" });
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

    it("saves the last position when the player closes", async () => {
        const { calls } = renderPlayer();
        const element = await videoElement();
        act(() => loadMetadata(element, 1500));
        await act(() => element.play());
        for (const position of [301, 302]) {
            act(() => {
                element.currentTime = position;
            });
        }
        await waitFor(() => expect(callsOf(calls, "save_progress")).toHaveLength(1));

        cleanup();

        await waitFor(() =>
            expect(callsOf(calls, "save_progress")).toContainEqual({ id: 1, positionSeconds: 302, finished: false })
        );
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
        await waitFor(() => expect(callsOf(calls, "get_video")).toContainEqual({ path: next.filePath }));
    });

    it("lists the whole playlist with the current video marked, and its place under the title", async () => {
        renderPlayer();
        const panel = await screen.findByRole("complementary", { name: "Playlist" });
        expect(within(panel).getByRole("heading", { name: "Show" })).toBeInTheDocument();
        expect(await within(panel).findByText("1 of 2")).toBeInTheDocument();
        // The video playing now is marked, and is not a button: choosing it would do nothing.
        const playing = within(panel).getByText("Now playing").closest("[aria-current]");
        expect(playing).toHaveTextContent("Pilot");
        expect(within(panel).queryByRole("button", { name: /Pilot/ })).not.toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: /The Second One/ })).toBeInTheDocument();

        expect(screen.getByRole("heading", { name: "Pilot", level: 1 })).toBeInTheDocument();
        expect(screen.getByText("Video 1 of 2, 25:00")).toBeInTheDocument();
        // The bar above shows where the video comes from, not its title again.
        expect(screen.getByRole("link", { name: "Show" })).toHaveAttribute("href", expect.stringContaining("folder"));
        expect(screen.getByRole("button", { name: "Open externally" })).toBeInTheDocument();
    });

    it("shows the time under the pointer above the seek bar", async () => {
        renderPlayer();
        await playingAt(0);
        const bar = screen.getByRole("slider", { name: "Seek" }).closest(".relative.flex")?.parentElement;
        if (!bar) {
            throw new Error("no seek bar");
        }
        vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(
            DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 20 })
        );

        fireEvent.pointerMove(bar, { clientX: 50 });
        // A quarter of the 25 minutes.
        expect(bar).toHaveTextContent("6:15");
        fireEvent.pointerLeave(bar);
        expect(bar).not.toHaveTextContent("6:15");
    });

    it("shows a toggle that turns green once the video is watched", async () => {
        const { user } = renderPlayer();
        const toggle = await screen.findByRole("button", { name: "Watched" });
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(toggle).toHaveAttribute("title", "Mark as watched");
        await user.click(toggle);
        // Regression: the label stays the same; only the pressed state (and the color) says it is watched.
        await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
        expect(toggle).toHaveAccessibleName("Watched");
        expect(toggle).toHaveClass("bg-success");
        expect(toggle).toHaveAttribute("title", "Mark as unwatched");
    });

    it("moves the playlist under the details in a narrow window, keeping its saved width", async () => {
        setWindowWidth(800);
        renderPlayer({ preferences: { ...DEFAULT_PLAYER_PREFERENCES, upNextWidth: 360 } });
        // After the title, in reading order.
        const title = await screen.findByRole("heading", { name: "Pilot", level: 1 });
        const panel = screen.getByRole("complementary", { name: "Playlist" });
        expect(panel.style.width).toBe("");
        expect(screen.queryByRole("separator", { name: "Resize playlist" })).not.toBeInTheDocument();
        expect(title.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        act(() => setWindowWidth(1200));
        expect(screen.getByRole("complementary", { name: "Playlist" })).toHaveStyle({ width: "360px" });
        expect(screen.getByRole("separator", { name: "Resize playlist" })).toBeInTheDocument();
    });

    it("switches to theater mode with the button or T, without reloading the video", async () => {
        const { user } = renderPlayer();
        const element = await videoElement();
        const theater = screen.getByRole("button", { name: "Theater mode" });
        expect(theater).toHaveAttribute("aria-pressed", "false");

        await user.click(theater);
        expect(screen.getByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "true");
        expect(document.querySelector("video")).toBe(element);
        expect(screen.getByRole("complementary", { name: "Playlist" })).toBeInTheDocument();

        await user.keyboard("t");
        expect(screen.getByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "false");
        expect(document.querySelector("video")).toBe(element);
    });

    it("starts with the preferences saved last time", async () => {
        renderPlayer({
            subtitle: true,
            preferences: {
                volume: 0.4,
                muted: true,
                speed: 1.5,
                subtitlesEnabled: false,
                theater: true,
                upNextWidth: 360,
            },
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
        expect(screen.getByRole("complementary", { name: "Playlist" })).toHaveStyle({ width: "360px" });
    });

    describe("Playlist width", () => {
        it("follows the window until its edge is moved, with the keyboard or the pointer", async () => {
            const { user } = renderPlayer({ preferences: { ...DEFAULT_PLAYER_PREFERENCES, upNextWidth: 320 } });
            const element = await playingAt(60);
            const panel = screen.getByRole("complementary", { name: "Playlist" });
            const edge = screen.getByRole("separator", { name: "Resize playlist" });
            expect(edge).toHaveAttribute("aria-valuenow", "320");

            // Left widens the column; the player's own arrow keys (seek) are not triggered.
            edge.focus();
            await user.keyboard("{ArrowLeft}{ArrowLeft}");
            expect(panel).toHaveStyle({ width: "352px" });
            await user.keyboard("{ArrowRight}");
            expect(panel).toHaveStyle({ width: "336px" });
            expect(element.currentTime).toBe(60);

            fireEvent.pointerDown(edge, { clientX: 1000 });
            fireEvent.pointerMove(window, { clientX: 900, buttons: 1 });
            fireEvent.pointerUp(window);
            expect(panel).toHaveStyle({ width: "436px" });
            expect(usePlayerStore.getState().upNextWidth).toBe(436);
        });

        it("stays between its limits and never takes more than half the window", async () => {
            renderPlayer({ preferences: { ...DEFAULT_PLAYER_PREFERENCES, upNextWidth: 300 } });
            await videoElement();
            const edge = screen.getByRole("separator", { name: "Resize playlist" });
            const panel = screen.getByRole("complementary", { name: "Playlist" });

            fireEvent.pointerDown(edge, { clientX: 500 });
            fireEvent.pointerMove(window, { clientX: 900, buttons: 1 });
            expect(panel).toHaveStyle({ width: "240px" });
            fireEvent.pointerMove(window, { clientX: -2000, buttons: 1 });
            fireEvent.pointerUp(window);
            expect(panel).toHaveStyle({ width: `${Math.min(800, window.innerWidth / 2)}px` });
        });

        it("goes back to the automatic width on double-click", async () => {
            const { user } = renderPlayer({ preferences: { ...DEFAULT_PLAYER_PREFERENCES, upNextWidth: 500 } });
            await videoElement();
            await user.dblClick(screen.getByRole("separator", { name: "Resize playlist" }));
            expect(usePlayerStore.getState().upNextWidth).toBeNull();
            expect(screen.getByRole("complementary", { name: "Playlist" }).style.width).toBe("");
        });
    });

    it("saves a burst of changes once, after a short pause", async () => {
        const { user, calls } = renderPlayer();
        await videoElement();
        await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}]");

        await waitFor(() => expect(callsOf(calls, "update_player_preferences")).toHaveLength(1));
        // One more change after it: had the burst saved again later, that save would come before this one's.
        await user.keyboard("{ArrowUp}");
        await waitFor(() => expect(callsOf(calls, "update_player_preferences")).toHaveLength(2));
        expect(callsOf(calls, "update_player_preferences")).toEqual([
            { preferences: { ...DEFAULT_PLAYER_PREFERENCES, volume: 0.85, speed: 1.25 } },
            { preferences: { ...DEFAULT_PLAYER_PREFERENCES, volume: 0.9, speed: 1.25 } },
        ]);
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
        await playingAt(754.2);

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
        expect(await screen.findByRole("button", { name: "Needs ffmpeg to capture frames" })).toHaveAttribute(
            "aria-disabled",
            "true"
        );
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

    it("saves progress once a video opened before it was read gets its record", async () => {
        // Regression: the saver kept the record from when the player opened, so such a video never saved progress.
        const { calls, queryClient, storeVideo } = renderPlayer({ video: null });
        const element = await videoElement();
        act(() => loadMetadata(element, 600));
        storeVideo(videoFixture({ id: 5, filePath: `${SHOW}\\Raw.mkv` }));
        await act(() => queryClient.invalidateQueries({ queryKey: ["library"] }));
        await waitFor(() => expect(screen.queryByText(/has not been read yet/)).not.toBeInTheDocument());

        await act(() => element.play());
        act(() => {
            element.currentTime = 30;
        });
        act(() => element.pause());

        await waitFor(() =>
            expect(callsOf(calls, "save_progress")).toContainEqual({ id: 5, positionSeconds: 30, finished: false })
        );
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

    describe("pin window", () => {
        it("starts unpinned and toggles from its button, which shows its key", async () => {
            const { user, calls } = renderPlayer({ shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, pinWindow: ["P"] } });
            const pin = await screen.findByRole("button", { name: "Pin window" });
            await waitFor(() => expect(callsOf(calls, "get_window_mode")).toHaveLength(1));
            expect(pin).toHaveAttribute("aria-pressed", "false");
            await user.hover(pin);
            expect(await screen.findByRole("tooltip")).toHaveTextContent("Pin windowP");

            await user.click(pin);
            expect(pin).toHaveAttribute("aria-pressed", "true");
            await user.click(pin);
            await waitFor(() => expect(pin).toHaveAttribute("aria-pressed", "false"));
            expect(callsOf(calls, "set_window_pinned")).toEqual([{ pinned: true }, { pinned: false }]);
        });

        it("goes back to unpinned and says why when the system refuses", async () => {
            const { user } = renderPlayer({ pinFails: true });
            const pin = await screen.findByRole("button", { name: "Pin window" });
            await user.click(pin);

            expect(await screen.findByText("Could not pin the window")).toBeInTheDocument();
            expect(screen.getByText("the window manager said no")).toBeInTheDocument();
            expect(pin).toHaveAttribute("aria-pressed", "false");
        });

        it("explains why it is unavailable where windows cannot stay on top", async () => {
            const { user, calls } = renderPlayer({ onTopSupported: false });
            const pin = await screen.findByRole("button", {
                name: "Keeping the window on top isn't supported on this system",
            });
            expect(pin).toHaveAttribute("aria-disabled", "true");
            await user.click(pin);
            expect(callsOf(calls, "set_window_pinned")).toEqual([]);
        });
    });

    describe("files the player cannot open", () => {
        /** The player fails to open the file, as with an MPEG-TS saved as `.mp4`. */
        async function failToOpen(): Promise<HTMLVideoElement> {
            const element = await videoElement();
            fireEvent.error(element);
            return element;
        }

        it("asks before making a playable copy, then plays from it", async () => {
            const { user, calls } = renderPlayer();
            const element = await failToOpen();
            const question = await screen.findByRole("region", { name: "Play from a playable copy?" });
            expect(question).toHaveTextContent("MPEG-TS (MPEG-2 Transport Stream)");
            expect(question).toHaveTextContent("91.6 MB");

            await user.click(within(question).getByRole("button", { name: "Make playable copy" }));
            await waitFor(() => expect(element.getAttribute("src")).toContain("0123456789abcdef.mp4"));
            expect(callsOf(calls, "make_playable_copy")).toEqual([{ path: current.filePath }]);
            expect(callsOf(calls, "update_playable_copy_settings")).toEqual([]);
            expect(screen.queryByRole("region", { name: "Play from a playable copy?" })).not.toBeInTheDocument();
        });

        it("resumes the copy from the saved position", async () => {
            const { user } = renderPlayer();
            const element = await failToOpen();
            await user.click(await screen.findByRole("button", { name: "Make playable copy" }));
            await waitFor(() => expect(element.getAttribute("src")).toContain("0123456789abcdef.mp4"));
            act(() => loadMetadata(element, 1500));
            expect(element.currentTime).toBe(300);
        });

        it("remembers to always make copies when asked to", async () => {
            const { user, calls } = renderPlayer();
            await failToOpen();
            await user.click(await screen.findByRole("switch", { name: "Remember my choice" }));
            await user.click(screen.getByRole("button", { name: "Make playable copy" }));
            await waitFor(() =>
                expect(callsOf(calls, "update_playable_copy_settings")).toEqual([
                    { settings: { ...DEFAULT_PLAYABLE_COPY_SETTINGS, mode: "always" } },
                ])
            );
        });

        it("remembers a refusal, and still offers a copy from the error", async () => {
            const { user, calls } = renderPlayer();
            await failToOpen();
            await user.click(await screen.findByRole("switch", { name: "Remember my choice" }));
            await user.click(screen.getByRole("button", { name: "Not now" }));
            expect(await screen.findByText("This video can't be played here")).toBeInTheDocument();
            expect(callsOf(calls, "update_playable_copy_settings")).toEqual([
                { settings: { ...DEFAULT_PLAYABLE_COPY_SETTINGS, mode: "never" } },
            ]);
            expect(callsOf(calls, "make_playable_copy")).toEqual([]);

            await user.click(screen.getByRole("button", { name: "Make playable copy" }));
            await waitFor(() => expect(callsOf(calls, "make_playable_copy")).toHaveLength(1));
        });

        it("makes the copy without asking when told to always", async () => {
            const { calls } = renderPlayer({
                commands: { get_playable_copy_settings: { ...DEFAULT_PLAYABLE_COPY_SETTINGS, mode: "always" } },
            });
            const element = await failToOpen();
            await waitFor(() => expect(element.getAttribute("src")).toContain("0123456789abcdef.mp4"));
            expect(callsOf(calls, "make_playable_copy")).toHaveLength(1);
        });

        it("plays a copy made before without asking", async () => {
            const { calls } = renderPlayer({
                commands: { check_playable_copy: { container: "MPEG-TS", sizeBytes: 1, ready: true } },
            });
            const element = await failToOpen();
            await waitFor(() => expect(element.getAttribute("src")).toContain("0123456789abcdef.mp4"));
            expect(callsOf(calls, "make_playable_copy")).toHaveLength(1);
        });

        it("says copies are turned off when told never to make them", async () => {
            const { calls } = renderPlayer({
                commands: { get_playable_copy_settings: { ...DEFAULT_PLAYABLE_COPY_SETTINGS, mode: "never" } },
            });
            await failToOpen();
            expect(
                await screen.findByText("Playable copies are turned off in Settings > Playback.")
            ).toBeInTheDocument();
            expect(callsOf(calls, "make_playable_copy")).toEqual([]);
        });

        it("explains why a copy cannot help, without offering one", async () => {
            renderPlayer({
                commands: {
                    check_playable_copy: () => {
                        throw commandError(
                            "invalidInput",
                            "its video is MPEG-4 part 2, which the built-in player can't decode, in any container"
                        );
                    },
                },
            });
            await failToOpen();
            expect(await screen.findByText(/its video is MPEG-4 part 2/)).toBeInTheDocument();
            expect(screen.getByText("This video can't be played here")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Make playable copy" })).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Open in default player" })).toBeInTheDocument();
        });

        it("shows the cause when the copy cannot be made", async () => {
            const { user } = renderPlayer({
                commands: {
                    make_playable_copy: () => {
                        throw commandError("io", "not enough free disk space for the playable copy: C:\\copies");
                    },
                },
            });
            await failToOpen();
            await user.click(await screen.findByRole("button", { name: "Make playable copy" }));
            expect(
                await screen.findByText(
                    "Could not make a playable copy: not enough free disk space for the playable copy: C:\\copies"
                )
            ).toBeInTheDocument();
        });

        it("cancels the copy being made", async () => {
            let rejectCopy: (error: unknown) => void = () => {};
            const { user, calls } = renderPlayer({
                commands: {
                    make_playable_copy: () =>
                        new Promise((_, reject) => {
                            rejectCopy = reject;
                        }),
                    cancel_playable_copy: () => rejectCopy(commandError("cancelled", "operation cancelled")),
                },
            });
            await failToOpen();
            await user.click(await screen.findByRole("button", { name: "Make playable copy" }));
            expect(await screen.findByText("Making a playable copy…")).toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Cancel" }));
            expect(await screen.findByText("This video can't be played here")).toBeInTheDocument();
            expect(callsOf(calls, "cancel_playable_copy")).toHaveLength(1);
            expect(screen.getByRole("button", { name: "Make playable copy" })).toBeInTheDocument();
        });

        it("cancels the copy being made when the player closes", async () => {
            const { user, calls } = renderPlayer({
                commands: { make_playable_copy: () => new Promise(() => {}) },
            });
            await failToOpen();
            await user.click(await screen.findByRole("button", { name: "Make playable copy" }));
            await screen.findByText("Making a playable copy…");
            cleanup();
            await waitFor(() => expect(callsOf(calls, "cancel_playable_copy")).toHaveLength(1));
        });

        it("gives up when even the copy cannot be played", async () => {
            const { user } = renderPlayer();
            const element = await failToOpen();
            await user.click(await screen.findByRole("button", { name: "Make playable copy" }));
            await waitFor(() => expect(element.getAttribute("src")).toContain("0123456789abcdef.mp4"));
            fireEvent.error(element);
            expect(await screen.findByText("Its playable copy could not be played either.")).toBeInTheDocument();
        });
    });

    describe("mini player", () => {
        afterEach(() => {
            Reflect.deleteProperty(document, "fullscreenElement");
        });

        it("shows only the video and its essential controls, without reloading it", async () => {
            const { user, calls } = renderPlayer();
            const element = await playingAt(60);
            Object.defineProperty(element, "videoWidth", { configurable: true, value: 1440 });
            Object.defineProperty(element, "videoHeight", { configurable: true, value: 1080 });

            await user.click(screen.getByRole("button", { name: "Mini player" }));
            await screen.findByRole("button", { name: "Expand" });
            expect(callsOf(calls, "enter_mini_player")).toEqual([{ videoWidth: 1440, videoHeight: 1080 }]);
            expect(document.querySelector("video")).toBe(element);
            // Its button went away with the full controls: focus moves to the video, next to the new ones.
            expect(element.parentElement).toHaveFocus();

            expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Close player" })).toBeInTheDocument();
            for (const gone of ["Keyboard shortcuts", "Watched", "Theater mode", "Full screen", "Mute", "Pin window"]) {
                expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
            }
            expect(screen.queryByRole("complementary", { name: "Playlist" })).not.toBeInTheDocument();

            // Every control is reachable from the keyboard, and shows while focused.
            await user.tab();
            expect(screen.getByRole("slider", { name: "Seek" })).toHaveFocus();
            await user.tab();
            expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
            await user.tab();
            expect(screen.getByRole("button", { name: "Expand" })).toHaveFocus();
            await user.tab();
            expect(screen.getByRole("button", { name: "Close player" })).toHaveFocus();

            await user.click(screen.getByRole("button", { name: "Close player" }));
            await waitFor(() => expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument());
        });

        it("leaves with Escape first, and only then closes the player", async () => {
            const { user, router, calls } = renderPlayer();
            await playingAt(60);
            await user.keyboard("i");
            expect(await screen.findByRole("button", { name: "Expand" })).toBeInTheDocument();

            await user.keyboard("{Escape}");
            expect(await screen.findByRole("button", { name: "Mini player" })).toBeInTheDocument();
            expect(callsOf(calls, "exit_mini_player")).toHaveLength(1);
            expect(router.state.location.pathname).toBe("/watch");
            expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeInTheDocument();

            await user.keyboard("{Escape}");
            await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        });

        it("toggles with its key and shows it in the tooltip", async () => {
            const { user, calls } = renderPlayer({ shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS, miniPlayer: ["P"] } });
            await playingAt(60);
            await user.hover(screen.getByRole("button", { name: "Mini player" }));
            expect(await screen.findByRole("tooltip")).toHaveTextContent("Mini playerP");

            await user.keyboard("p");
            expect(await screen.findByRole("button", { name: "Expand" })).toBeInTheDocument();
            await user.keyboard("p");
            expect(await screen.findByRole("button", { name: "Mini player" })).toBeInTheDocument();
            expect(callsOf(calls, "exit_mini_player")).toHaveLength(1);
        });

        it("leaves full screen before shrinking the window", async () => {
            const { user, calls } = renderPlayer();
            await playingAt(60);
            let fullscreenElement: Element | null = document.body;
            let enteredWhileFullscreen = false;
            Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
            document.exitFullscreen = vi.fn(async () => {
                enteredWhileFullscreen = callsOf(calls, "enter_mini_player").length > 0;
                fullscreenElement = null;
            });

            await user.keyboard("i");
            expect(await screen.findByRole("button", { name: "Expand" })).toBeInTheDocument();
            expect(document.exitFullscreen).toHaveBeenCalledOnce();
            expect(enteredWhileFullscreen).toBe(false);
        });

        it("leaves before going full screen, and stays if leaving fails", async () => {
            const requestFullscreen = vi.fn().mockResolvedValue(undefined);
            HTMLElement.prototype.requestFullscreen = requestFullscreen;
            const { user, calls } = renderPlayer({ exitMiniFails: true });
            await playingAt(60);
            await user.keyboard("i");
            expect(await screen.findByRole("button", { name: "Expand" })).toBeInTheDocument();

            await user.keyboard("f");
            expect(await screen.findByText("Could not restore the window")).toBeInTheDocument();
            expect(callsOf(calls, "exit_mini_player")).toHaveLength(1);
            expect(requestFullscreen).not.toHaveBeenCalled();
            expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
        });

        it("brings theater mode back afterwards, and T in it says what it will be", async () => {
            const { user } = renderPlayer();
            await playingAt(60);
            await user.keyboard("t");
            await user.keyboard("i");
            await screen.findByRole("button", { name: "Expand" });
            expect(screen.queryByRole("complementary", { name: "Playlist" })).not.toBeInTheDocument();

            await user.keyboard("t");
            expect(
                await screen.findByText("Theater mode off", { selector: "[role=status] > span" })
            ).toBeInTheDocument();
            await user.keyboard("t");

            await user.click(screen.getByRole("button", { name: "Expand" }));
            expect(await screen.findByRole("button", { name: "Theater mode" })).toHaveAttribute("aria-pressed", "true");
            expect(screen.getByRole("complementary", { name: "Playlist" })).toBeInTheDocument();
        });

        it("still plays the next video on its own, from a compact card", async () => {
            const { user, router, calls } = renderPlayer();
            const element = await playingAt(60);
            await user.keyboard("i");
            await screen.findByRole("button", { name: "Expand" });

            act(() => playToEnd(element));
            const card = await screen.findByRole("dialog", { name: /Up next in/ });
            expect(card).toHaveTextContent("The Second One");
            expect(within(card).getByRole("button", { name: "Play now" })).toHaveFocus();
            // Escape cancels the countdown, and leaves the mini player alone.
            await user.keyboard("{Escape}");
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(callsOf(calls, "exit_mini_player")).toEqual([]);

            act(() => playToEnd(element));
            await user.click(await screen.findByRole("button", { name: "Play now" }));
            await waitFor(() => expect(router.state.location.search).toEqual({ path: next.filePath }));
            // The next video fits the mini player to its own shape.
            const following = await videoElement();
            act(() => loadMetadata(following, 1500));
            await waitFor(() => expect(callsOf(calls, "set_mini_player_aspect")).toHaveLength(1));
            expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
        });

        it("explains why it is unavailable where windows cannot stay on top", async () => {
            const { user, calls } = renderPlayer({ onTopSupported: false });
            await playingAt(60);
            const button = await screen.findByRole("button", {
                name: "The mini player needs a window that stays on top, which this system doesn't support",
            });
            expect(button).toHaveAttribute("aria-disabled", "true");
            await user.keyboard("i");
            expect(
                await screen.findByText("The mini player isn't supported on this system", {
                    selector: "[role=status] > span",
                })
            ).toBeInTheDocument();
            expect(callsOf(calls, "enter_mini_player")).toEqual([]);
        });
    });
});
