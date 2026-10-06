import type { KeyboardShortcuts } from "../../../shared/ipc/bindings";
import type { ShortcutKeys } from "../../../shared/lib/keyboard";

export type ShortcutAction = keyof KeyboardShortcuts;

/** How the actions are named and grouped, in the help and in Settings. */
export const SHORTCUT_GROUPS: { title: string; actions: { action: ShortcutAction; label: string }[] }[] = [
    {
        title: "Playback",
        actions: [
            { action: "playPause", label: "Play or pause" },
            { action: "seekBack10", label: "Back 10 seconds" },
            { action: "seekForward10", label: "Forward 10 seconds" },
            { action: "seekBack5", label: "Back 5 seconds" },
            { action: "seekForward5", label: "Forward 5 seconds" },
        ],
    },
    {
        title: "Sound and speed",
        actions: [
            { action: "volumeUp", label: "Volume up" },
            { action: "volumeDown", label: "Volume down" },
            { action: "mute", label: "Mute" },
            { action: "speedDown", label: "Slower" },
            { action: "speedUp", label: "Faster" },
            { action: "speedReset", label: "Normal speed" },
        ],
    },
    {
        title: "View",
        actions: [
            { action: "fullscreen", label: "Full screen" },
            { action: "theater", label: "Theater mode" },
            { action: "subtitles", label: "Subtitles" },
        ],
    },
    {
        title: "Navigation",
        actions: [
            { action: "historyBack", label: "Go back" },
            { action: "historyForward", label: "Go forward" },
        ],
    },
];

const labels = new Map(SHORTCUT_GROUPS.flatMap((group) => group.actions.map(({ action, label }) => [action, label])));

export function actionLabel(action: ShortcutAction): string {
    return labels.get(action) ?? action;
}

/** The action that already uses `combo`, if any. */
export function actionUsing(shortcuts: ShortcutKeys, combo: string): ShortcutAction | null {
    for (const { actions } of SHORTCUT_GROUPS) {
        for (const { action } of actions) {
            if (shortcuts[action].includes(combo)) {
                return action;
            }
        }
    }
    return null;
}

/** A writable copy, as the backend takes it. */
export function copyShortcuts(shortcuts: ShortcutKeys): KeyboardShortcuts {
    return {
        playPause: [...shortcuts.playPause],
        seekBack10: [...shortcuts.seekBack10],
        seekForward10: [...shortcuts.seekForward10],
        seekBack5: [...shortcuts.seekBack5],
        seekForward5: [...shortcuts.seekForward5],
        volumeUp: [...shortcuts.volumeUp],
        volumeDown: [...shortcuts.volumeDown],
        mute: [...shortcuts.mute],
        speedDown: [...shortcuts.speedDown],
        speedUp: [...shortcuts.speedUp],
        speedReset: [...shortcuts.speedReset],
        fullscreen: [...shortcuts.fullscreen],
        theater: [...shortcuts.theater],
        subtitles: [...shortcuts.subtitles],
        historyBack: [...shortcuts.historyBack],
        historyForward: [...shortcuts.historyForward],
    };
}

/** A writable copy with `action` given `keys`; `combo` is first taken away from `takeFrom` when moving a key. */
export function withKeys(
    shortcuts: ShortcutKeys,
    action: ShortcutAction,
    keys: readonly string[],
    takeFrom?: { action: ShortcutAction; combo: string }
): KeyboardShortcuts {
    const copy = copyShortcuts(shortcuts);
    if (takeFrom) {
        copy[takeFrom.action] = copy[takeFrom.action].filter((key) => key !== takeFrom.combo);
    }
    copy[action] = [...keys];
    return copy;
}
