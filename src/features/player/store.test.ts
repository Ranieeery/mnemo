import { beforeEach, describe, expect, it } from "vitest";
import { playerPreferences, usePlayerStore } from "./store";

describe("player preferences", () => {
    beforeEach(() => {
        usePlayerStore.setState({ volume: 1, muted: false, speed: 1, subtitlesEnabled: true, continuing: false });
    });

    it("keeps volume between 0 and 1 in 5% steps, muting at zero", () => {
        playerPreferences.changeVolume(0.05);
        expect(usePlayerStore.getState().volume).toBe(1);
        for (let step = 0; step < 25; step++) {
            playerPreferences.changeVolume(-0.05);
        }
        expect(usePlayerStore.getState()).toMatchObject({ volume: 0, muted: true });
        playerPreferences.toggleMute();
        expect(usePlayerStore.getState()).toMatchObject({ volume: 1, muted: false });
    });

    it("keeps speed between 0.25x and 2x in quarter steps", () => {
        for (let step = 0; step < 10; step++) {
            playerPreferences.changeSpeed(0.25);
        }
        expect(usePlayerStore.getState().speed).toBe(2);
        playerPreferences.setSpeed(0.1);
        expect(usePlayerStore.getState().speed).toBe(0.25);
        playerPreferences.setSpeed(1.3);
        expect(usePlayerStore.getState().speed).toBe(1.25);
    });

    it("resets speed and subtitles for a new video but not for the next one in the playlist", () => {
        playerPreferences.setSpeed(1.5);
        playerPreferences.toggleSubtitles();
        playerPreferences.continueWithNext();
        playerPreferences.startVideo();
        expect(usePlayerStore.getState()).toMatchObject({ speed: 1.5, subtitlesEnabled: false, continuing: false });

        playerPreferences.startVideo();
        expect(usePlayerStore.getState()).toMatchObject({ speed: 1, subtitlesEnabled: true });
    });
});
