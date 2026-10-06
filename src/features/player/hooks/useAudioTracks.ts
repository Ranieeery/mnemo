import { type RefObject, useEffect, useState } from "react";
import type { AudioTrack } from "../../../shared/ipc/bindings";
import { matchAudioTracks } from "../lib/tracks";

/** The part of the media `AudioTrackList` the player uses. Not in TypeScript's DOM types: Chromium only exposes it
 * behind a flag (enabled for WebView2 in `tauri.conf.json`), WebKit always. */
type PlayerAudioTrack = { enabled: boolean; language: string };
type PlayerAudioTrackList = ArrayLike<PlayerAudioTrack> & Pick<EventTarget, "addEventListener" | "removeEventListener">;

function isTrackList(value: unknown): value is PlayerAudioTrackList {
    return (
        typeof value === "object" &&
        value !== null &&
        "length" in value &&
        typeof value.length === "number" &&
        "addEventListener" in value
    );
}

function trackListOf(element: HTMLVideoElement): PlayerAudioTrackList | null {
    const list: unknown = Reflect.get(element, "audioTracks");
    return isTrackList(list) ? list : null;
}

function tracksOf(list: PlayerAudioTrackList): PlayerAudioTrack[] {
    return Array.from({ length: list.length }, (_, index) => list[index]).filter(
        (track): track is PlayerAudioTrack => track !== undefined
    );
}

export type AudioTracksState = {
    /** The file's audio tracks, each with its position in the player or `null` when it cannot be played here. */
    tracks: { track: AudioTrack; playerIndex: number | null }[];
    /** Whether this player can switch tracks at all. */
    switchable: boolean;
    /**
     * Why tracks cannot be switched or heard: the player has no track API, it can decode none of the file's audio
     * (the video plays silent), or its tracks could not be matched with the file's.
     */
    problem: "no-switching" | "no-playable-audio" | "unmatched" | null;
    /** The file track playing now (`AudioTrack.index`), when known. */
    selected: number | null;
    select: (index: number) => void;
};

/** The video's audio tracks (from ffprobe) matched with the player's, and switching between them. */
export function useAudioTracks(videoRef: RefObject<HTMLVideoElement | null>, fileTracks: readonly AudioTrack[]) {
    // What the player exposes, refreshed when it loads or its tracks change. `loaded` once it read the file's
    // metadata: before that an empty list means nothing.
    const [playerTracks, setPlayerTracks] = useState<PlayerAudioTrack[] | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const element = videoRef.current;
        const list = element ? trackListOf(element) : null;
        if (!element || !list) {
            return;
        }
        const refresh = () => {
            setPlayerTracks(tracksOf(list).map(({ enabled, language }) => ({ enabled, language })));
            setLoaded(element.readyState >= HTMLMediaElement.HAVE_METADATA);
        };
        refresh();
        element.addEventListener("loadedmetadata", refresh);
        list.addEventListener("change", refresh);
        list.addEventListener("addtrack", refresh);
        return () => {
            element.removeEventListener("loadedmetadata", refresh);
            list.removeEventListener("change", refresh);
            list.removeEventListener("addtrack", refresh);
        };
    }, [videoRef]);

    const matched = matchAudioTracks(
        fileTracks,
        (playerTracks ?? []).map((track) => track.language)
    );
    const tracks = fileTracks.map((track, position) => ({ track, playerIndex: matched[position] ?? null }));
    const playing = playerTracks?.findIndex((track) => track.enabled) ?? -1;
    const selected = tracks.find((entry) => entry.playerIndex !== null && entry.playerIndex === playing)?.track.index;

    const select = (index: number) => {
        const element = videoRef.current;
        const list = element ? trackListOf(element) : null;
        const target = tracks.find((entry) => entry.track.index === index)?.playerIndex;
        if (!list || target === null || target === undefined) {
            return;
        }
        // Enable the new track first, so there is never a moment without sound.
        const all = tracksOf(list);
        const chosen = all[target];
        if (chosen) {
            chosen.enabled = true;
        }
        for (const [position, track] of all.entries()) {
            if (position !== target) {
                track.enabled = false;
            }
        }
        // Not every player fires "change" for a switch made from script.
        setPlayerTracks(all.map(({ enabled, language }) => ({ enabled, language })));
    };

    const switchable = playerTracks !== null && tracks.some((entry) => entry.playerIndex !== null);
    let problem: AudioTracksState["problem"] = null;
    if (playerTracks === null) {
        problem = "no-switching";
    } else if (loaded && playerTracks.length === 0 && fileTracks.length > 0) {
        problem = "no-playable-audio";
    } else if (!switchable) {
        problem = "unmatched";
    }

    return {
        tracks,
        switchable,
        problem,
        selected: selected ?? null,
        select,
    } satisfies AudioTracksState;
}
