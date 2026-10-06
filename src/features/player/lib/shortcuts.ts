import { type KeyboardShortcuts, PLAYBACK_SPEED_STEP } from "../../../shared/ipc/bindings";
import { comboFromEvent, type ShortcutKeys } from "../../../shared/lib/keyboard";

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

/** The configurable actions the player handles; history back and forward belong to the app's navigation. */
const commandByAction = {
    playPause: { type: "togglePlay" },
    seekBack10: { type: "seek", by: -10 },
    seekForward10: { type: "seek", by: 10 },
    seekBack5: { type: "seek", by: -5 },
    seekForward5: { type: "seek", by: 5 },
    volumeUp: { type: "volume", by: VOLUME_STEP },
    volumeDown: { type: "volume", by: -VOLUME_STEP },
    mute: { type: "mute" },
    speedDown: { type: "speed", by: -PLAYBACK_SPEED_STEP },
    speedUp: { type: "speed", by: PLAYBACK_SPEED_STEP },
    speedReset: { type: "resetSpeed" },
    fullscreen: { type: "fullscreen" },
    theater: { type: "theater" },
    subtitles: { type: "subtitles" },
} satisfies Partial<Record<keyof KeyboardShortcuts, PlayerCommand>>;

type KeyLike = Parameters<typeof comboFromEvent>[0];

/** Maps a key press to a player command using the configured shortcuts. `Esc` always closes (it is not configurable). */
export function commandForKey(event: KeyLike, shortcuts: ShortcutKeys): PlayerCommand | null {
    const combo = comboFromEvent(event);
    if (combo === null) {
        return null;
    }
    if (combo === "Escape") {
        return { type: "close" };
    }
    for (const [action, command] of Object.entries(commandByAction)) {
        if (isAction(action) && shortcuts[action].includes(combo)) {
            return command;
        }
    }
    return null;
}

function isAction(action: string): action is keyof typeof commandByAction {
    return Object.hasOwn(commandByAction, action);
}
