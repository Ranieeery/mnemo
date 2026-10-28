import { useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { commands, type PlayableCopyCheck, type PlayableCopySettings } from "../../../shared/ipc/bindings";
import { call, errorMessage, isErrorKind } from "../../../shared/ipc/client";
import { playableCopySettingsQuery, useSavePlayableCopySettings } from "../../../shared/ipc/queries";

/**
 * Where the video plays from. A file the built-in player cannot open (an MPEG-TS saved as `.mp4`, for example) can
 * play from a playable copy: an MP4 the backend makes without re-encoding, after asking unless told to remember.
 */
export type PlayableSource =
    | { kind: "original" }
    | { kind: "checking" }
    | { kind: "asking"; check: PlayableCopyCheck }
    | { kind: "preparing" }
    | { kind: "copy"; copyPath: string }
    /** `reason` explains why, when known; `canCopy` offers to make a copy anyway. */
    | { kind: "unplayable"; reason: string | null; canCopy: boolean };

const TURNED_OFF = "Playable copies are turned off in Settings > Playback.";

export function usePlayableSource(path: string) {
    const [source, setSource] = useState<PlayableSource>({ kind: "original" });
    const queryClient = useQueryClient();
    const saveSettings = useSavePlayableCopySettings();
    const preparing = useRef(false);

    // Leaving the video stops a copy still being made.
    useEffect(
        () => () => {
            if (preparing.current) {
                void commands.cancelPlayableCopy();
            }
        },
        []
    );

    const makeCopy = async () => {
        setSource({ kind: "preparing" });
        preparing.current = true;
        try {
            const copyPath = await call(commands.makePlayableCopy(path));
            setSource({ kind: "copy", copyPath });
        } catch (error) {
            setSource(
                isErrorKind(error, "cancelled")
                    ? { kind: "unplayable", reason: null, canCopy: true }
                    : {
                          kind: "unplayable",
                          reason: `Could not make a playable copy: ${errorMessage(error)}`,
                          canCopy: false,
                      }
            );
        } finally {
            preparing.current = false;
        }
    };

    /** The `<video>` failed to load: find out whether a copy can help and follow the saved choice. */
    const onError = async () => {
        if (source.kind === "copy") {
            setSource({ kind: "unplayable", reason: "Its playable copy could not be played either.", canCopy: false });
            return;
        }
        if (source.kind !== "original") {
            return;
        }
        setSource({ kind: "checking" });
        try {
            const [check, settings] = await Promise.all([
                call(commands.checkPlayableCopy(path)),
                queryClient.fetchQuery(playableCopySettingsQuery),
            ]);
            if (check.ready || settings.mode === "always") {
                return await makeCopy();
            }
            setSource(
                settings.mode === "never"
                    ? { kind: "unplayable", reason: TURNED_OFF, canCopy: true }
                    : { kind: "asking", check }
            );
        } catch (error) {
            setSource({ kind: "unplayable", reason: errorMessage(error), canCopy: false });
        }
    };

    /** The answer to the question; `remember` makes it the setting, so the question is not asked again. */
    const answer = (accepted: boolean, remember: boolean) => {
        const settings = queryClient.getQueryData<PlayableCopySettings>(playableCopySettingsQuery.queryKey);
        if (remember && settings) {
            saveSettings.mutate({ ...settings, mode: accepted ? "always" : "never" });
        }
        if (accepted) {
            void makeCopy();
        } else {
            setSource({ kind: "unplayable", reason: null, canCopy: true });
        }
    };

    return {
        source,
        /** Nothing covers the video. */
        playing: source.kind === "original" || source.kind === "copy",
        src: convertFileSrc(source.kind === "copy" ? source.copyPath : path),
        onError: () => void onError(),
        makeCopy: () => void makeCopy(),
        answer,
        cancel: () => void commands.cancelPlayableCopy(),
    };
}
