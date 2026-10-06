import { useEffect } from "react";
import { DEFAULT_PLAYER_PREFERENCES, type PlayerPreferences } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { toast } from "../../../shared/ui";
import { savePlayerPreferences, useSavedPlayerPreferences } from "../queries";
import { playerPreferences, preferencesOf, usePlayerStore } from "../store";

/** Changes are saved this long after the last one, so dragging the volume saves once. */
export const SAVE_DELAY_MS = 400;

const samePreferences = (a: PlayerPreferences, b: PlayerPreferences) =>
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.speed === b.speed &&
    a.subtitlesEnabled === b.subtitlesEnabled &&
    a.theater === b.theater &&
    a.upNextWidth === b.upNextWidth;

/**
 * Loads the saved player preferences into the store (once per session) and saves later changes. Returns whether
 * they are ready, so playback starts with them. If they cannot be loaded, the player uses the defaults.
 */
export function usePreferencesSession(): boolean {
    const hydrated = usePlayerStore((state) => state.hydrated);
    const saved = useSavedPlayerPreferences(!hydrated);

    useEffect(() => {
        if (saved.data) {
            playerPreferences.hydrate(saved.data);
        } else if (saved.isError) {
            toast({
                title: "Could not load player preferences",
                description: errorMessage(saved.error),
                tone: "danger",
            });
            playerPreferences.hydrate(DEFAULT_PLAYER_PREFERENCES);
        }
    }, [saved.data, saved.isError, saved.error]);

    useEffect(() => {
        if (!hydrated) {
            return;
        }
        let pending: PlayerPreferences | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const flush = () => {
            clearTimeout(timer);
            if (pending) {
                void savePlayerPreferences(pending);
                pending = null;
            }
        };
        const unsubscribe = usePlayerStore.subscribe((state, previous) => {
            const next = preferencesOf(state);
            if (!samePreferences(next, preferencesOf(previous))) {
                pending = next;
                clearTimeout(timer);
                timer = setTimeout(flush, SAVE_DELAY_MS);
            }
        });
        // Closing the player saves what is still waiting.
        return () => {
            unsubscribe();
            flush();
        };
    }, [hydrated]);

    return hydrated;
}
