import { create } from "zustand";

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type PlaybackPreferences = {
    volume: number;
    muted: boolean;
    speed: number;
    subtitlesEnabled: boolean;
    /** Set when moving to the next video of a playlist, so speed and subtitles carry over. */
    continuing: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const usePlayerStore = create<PlaybackPreferences>(() => ({
    volume: 1,
    muted: false,
    speed: 1,
    subtitlesEnabled: true,
    continuing: false,
}));

export const playerPreferences = {
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
        usePlayerStore.setState({ speed: clamp(Math.round(speed * 4) / 4, MIN_SPEED, MAX_SPEED) });
    },
    changeSpeed(by: number) {
        playerPreferences.setSpeed(usePlayerStore.getState().speed + by);
    },
    toggleSubtitles() {
        usePlayerStore.setState((state) => ({ subtitlesEnabled: !state.subtitlesEnabled }));
    },
    /** Call before switching to the next video of the playlist. */
    continueWithNext() {
        usePlayerStore.setState({ continuing: true });
    },
    /**
     * Call when a video opens. Volume always persists for the session; speed and subtitles only carry over within a
     * playlist, like the legacy player did with its "next video" prompt.
     */
    startVideo() {
        const { continuing } = usePlayerStore.getState();
        usePlayerStore.setState(continuing ? { continuing: false } : { speed: 1, subtitlesEnabled: true });
    },
};
