import { useEffect, useRef, useState } from "react";
import type { SubtitleTrack } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import type { Cue } from "../../../shared/lib/subtitles";
import { toast } from "../../../shared/ui";
import { defaultSubtitleSource, type SubtitleSource } from "../lib/tracks";
import { useEmbeddedSubtitleCues, useMediaTracks, useSubtitleCues } from "../queries";
import { playerPreferences, usePlayerStore } from "../store";

const NO_CUES: readonly Cue[] = [];

export type SubtitlesState = {
    /** Whether there is a subtitle file next to the video. */
    hasFile: boolean;
    /** Tracks inside the file; `null` while they are read or when they cannot be. */
    tracks: readonly SubtitleTrack[] | null;
    tracksStatus: "loading" | "error" | "ready";
    /** Whether anything can be shown at all. */
    available: boolean;
    active: SubtitleSource | null;
    /** The embedded track being extracted, if any. */
    extracting: number | null;
    cues: readonly Cue[];
    /** Shows a source (turning subtitles on), or turns them off with `null`. */
    choose: (source: SubtitleSource | null) => void;
};

/**
 * The subtitle sources of a video (the file next to it and its embedded tracks) and the one shown. Until the user
 * chooses, the default source plays. Embedded tracks are extracted only when shown.
 */
export function useSubtitles(path: string): SubtitlesState {
    // Until the saved preferences load, "on" is only the default: extracting then could read a whole file for nothing.
    const enabled = usePlayerStore((state) => state.hydrated && state.subtitlesEnabled);
    const file = useSubtitleCues(path);
    const tracks = useMediaTracks(path);
    // `undefined` until the user picks: the default source applies.
    const [choice, setChoice] = useState<SubtitleSource | null | undefined>(undefined);
    const previous = useRef<SubtitleSource | null | undefined>(undefined);

    const fileCues = file.data ?? NO_CUES;
    const hasFile = fileCues.length > 0;
    const subtitleTracks = tracks.data?.subtitles ?? null;
    const active = choice === undefined ? defaultSubtitleSource(hasFile, subtitleTracks ?? []) : choice;
    const embeddedIndex = enabled && active?.kind === "embedded" ? active.index : null;
    const embedded = useEmbeddedSubtitleCues(path, embeddedIndex);

    // A track that cannot be extracted goes back to what was shown before.
    useEffect(() => {
        if (embedded.isError) {
            toast({
                title: "Could not load the subtitles",
                description: errorMessage(embedded.error),
                tone: "danger",
            });
            setChoice(previous.current ?? null);
        }
    }, [embedded.isError, embedded.error]);

    const choose = (source: SubtitleSource | null) => {
        if (source === null) {
            playerPreferences.setSubtitlesEnabled(false);
            return;
        }
        previous.current = active;
        setChoice(source);
        playerPreferences.setSubtitlesEnabled(true);
    };

    return {
        hasFile,
        tracks: subtitleTracks,
        tracksStatus: tracks.isPending ? "loading" : tracks.isError ? "error" : "ready",
        available: hasFile || (subtitleTracks?.some((track) => track.isText) ?? false),
        active,
        extracting: embedded.isFetching ? embeddedIndex : null,
        cues: active?.kind === "file" ? fileCues : active?.kind === "embedded" ? (embedded.data ?? NO_CUES) : NO_CUES,
        choose,
    };
}
