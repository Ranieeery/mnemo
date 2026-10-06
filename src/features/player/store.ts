import { create } from "zustand";
import {
    DEFAULT_PLAYER_PREFERENCES,
    MAX_PLAYBACK_SPEED,
    MIN_PLAYBACK_SPEED,
    PLAYBACK_SPEED_STEP,
    type PlayerPreferences,
} from "../../shared/ipc/bindings";

export const SPEEDS: readonly number[] = Array.from(
    { length: Math.round((MAX_PLAYBACK_SPEED - MIN_PLAYBACK_SPEED) / PLAYBACK_SPEED_STEP) + 1 },
    (_, index) => MIN_PLAYBACK_SPEED + index * PLAYBACK_SPEED_STEP
);

/**
 * The player's preferences for this session, loaded once from the backend (`hydrated`) and saved back as they
 * change. Every video uses them.
 */
type PlayerState = PlayerPreferences & { hydrated: boolean };

export const usePlayerStore = create<PlayerState>(() => ({ ...DEFAULT_PLAYER_PREFERENCES, hydrated: false }));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The part of the state that is saved. */
export function preferencesOf({ volume, muted, speed, subtitlesEnabled, theater }: PlayerState): PlayerPreferences {
    return { volume, muted, speed, subtitlesEnabled, theater };
}

export const playerPreferences = {
    /** Applies the saved preferences, once per session: later changes in the store win. */
    hydrate(preferences: PlayerPreferences) {
        if (!usePlayerStore.getState().hydrated) {
            usePlayerStore.setState({ ...preferences, hydrated: true });
        }
    },
    setVolume(volume: number) {
        const next = Math.round(clamp(volume, 0, 1) * 100) / 100;
        usePlayerStore.setState({ volume: next, muted: next === 0 });
    },
    changeVolume(by: number) {
        const { volume, muted } = usePlayerStore.getState();
        playerPreferences.setVolume((muted ? 0 : volume) + by);
    },
    toggleMute() {
        const { muted, volume } = usePlayerStore.getState();
        // Unmuting a video whose volume was dragged to zero brings it back to an audible level.
        usePlayerStore.setState({ muted: !muted, volume: muted && volume === 0 ? 1 : volume });
    },
    setSpeed(speed: number) {
        const steps = Math.round(speed / PLAYBACK_SPEED_STEP) * PLAYBACK_SPEED_STEP;
        usePlayerStore.setState({ speed: clamp(steps, MIN_PLAYBACK_SPEED, MAX_PLAYBACK_SPEED) });
    },
    changeSpeed(by: number) {
        playerPreferences.setSpeed(usePlayerStore.getState().speed + by);
    },
    setSubtitlesEnabled(enabled: boolean) {
        usePlayerStore.setState({ subtitlesEnabled: enabled });
    },
    toggleSubtitles() {
        usePlayerStore.setState((state) => ({ subtitlesEnabled: !state.subtitlesEnabled }));
    },
    toggleTheater() {
        usePlayerStore.setState((state) => ({ theater: !state.theater }));
    },
};
