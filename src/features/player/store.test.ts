import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_PREFERENCES } from "../../shared/ipc/bindings";
import { playerPreferences, SPEEDS, usePlayerStore } from "./store";

describe("player preferences", () => {
    beforeEach(() => {
        usePlayerStore.setState({ ...DEFAULT_PLAYER_PREFERENCES, hydrated: false });
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

    it("takes the saved preferences once per session", () => {
        playerPreferences.hydrate({ ...DEFAULT_PLAYER_PREFERENCES, speed: 1.5, theater: true });
        expect(usePlayerStore.getState()).toMatchObject({ speed: 1.5, theater: true, hydrated: true });

        // Later changes in the session win over a late or repeated load.
        playerPreferences.setSpeed(2);
        playerPreferences.hydrate(DEFAULT_PLAYER_PREFERENCES);
        expect(usePlayerStore.getState()).toMatchObject({ speed: 2, theater: true });
    });

    it("offers every speed from 0.25x to 2x", () => {
        expect(SPEEDS).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
    });
});
