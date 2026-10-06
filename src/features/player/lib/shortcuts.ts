/** What a key does in the player. */
export type PlayerCommand =
    | { type: "togglePlay" }
    | { type: "seek"; by: number }
    | { type: "volume"; by: number }
    | { type: "speed"; by: number }
    | { type: "resetSpeed" }
    | { type: "fullscreen" }
    | { type: "theater" }
    | { type: "mute" }
    | { type: "subtitles" }
    | { type: "close" };

const VOLUME_STEP = 0.05;
const SPEED_STEP = 0.25;

const byKey: Record<string, PlayerCommand> = {
    " ": { type: "togglePlay" },
    k: { type: "togglePlay" },
    j: { type: "seek", by: -10 },
    l: { type: "seek", by: 10 },
    arrowleft: { type: "seek", by: -5 },
    arrowright: { type: "seek", by: 5 },
    arrowup: { type: "volume", by: VOLUME_STEP },
    arrowdown: { type: "volume", by: -VOLUME_STEP },
    "[": { type: "speed", by: -SPEED_STEP },
    "]": { type: "speed", by: SPEED_STEP },
    backspace: { type: "resetSpeed" },
    f: { type: "fullscreen" },
    t: { type: "theater" },
    m: { type: "mute" },
    c: { type: "subtitles" },
    escape: { type: "close" },
};

type KeyLike = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">;

/**
 * Maps a key press to a player command. Modified keys are left alone: Alt+arrows navigate the app history and
 * Ctrl/Cmd combinations belong to the system.
 */
export function commandForKey(event: KeyLike): PlayerCommand | null {
    if (event.altKey || event.ctrlKey || event.metaKey) {
        return null;
    }
    return byKey[event.key.toLowerCase()] ?? null;
}
