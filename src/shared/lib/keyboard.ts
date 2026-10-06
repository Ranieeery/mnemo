import { type KeyboardShortcuts, RESERVED_SHORTCUT_KEYS } from "../ipc/bindings";

/**
 * Key combinations as the backend stores them: modifiers in a fixed order and a key, joined by "+"
 * ("Alt+ArrowLeft", "K", "Space", "?"). Keys come from `KeyboardEvent.key`, so they follow the keyboard layout.
 */

/** The configured keys of every action, for reading (the generated defaults are read-only). */
export type ShortcutKeys = { readonly [Action in keyof KeyboardShortcuts]: readonly string[] };

/** Keys known by name, beyond single characters. Escape, Tab and Enter are recognized only to say they are reserved. */
const NAMED_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Backspace",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Escape",
    "Tab",
    "Enter",
    ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"> & {
    isComposing?: boolean;
};

/**
 * The combination a key press makes, or `null` for presses that cannot be a shortcut: modifiers alone, dead keys,
 * text being composed by an input method, and keys without a usable name.
 */
export function comboFromEvent(event: KeyLike): string | null {
    if (event.isComposing) {
        return null;
    }
    let key: string;
    if (event.key === " ") {
        key = "Space";
    } else if (event.key === "+") {
        key = "Plus";
    } else if ([...event.key].length === 1) {
        // Some letters grow when upper-cased ("ß" becomes "SS"); those keep their own form.
        const upper = event.key.toUpperCase();
        key = [...upper].length === 1 ? upper : event.key;
    } else if (NAMED_KEYS.has(event.key)) {
        key = event.key;
    } else {
        return null;
    }
    const printable = key.length === 1 || key === "Plus";
    const modifiers = [
        event.ctrlKey && "Ctrl",
        event.altKey && "Alt",
        // With a character Shift is already in it ("?" rather than "Shift+/").
        event.shiftKey && !printable && "Shift",
        event.metaKey && "Meta",
    ].filter((modifier) => modifier);
    return [...modifiers, key].join("+");
}

const keyNames: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Plus: "+",
    Escape: "Esc",
    PageUp: "Page Up",
    PageDown: "Page Down",
};

/** The pieces of a combination as people read them, one per keycap: "Alt+ArrowLeft" gives ["Alt", "←"]. */
export function comboParts(combo: string): string[] {
    return combo.split("+").map((part) => keyNames[part] ?? part);
}

/** A combination in one line, for tooltips: "Alt+←". */
export function comboLabel(combo: string): string {
    return comboParts(combo).join("+");
}

/** Whether keys typed at `target` are text, so single-key shortcuts must not react to them. */
export function isTextEntry(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
}

/** Whether a combination uses Ctrl, Alt or Meta, and so cannot be typing. */
export function hasCommandModifier(combo: string): boolean {
    const modifiers = combo.split("+").slice(0, -1);
    return modifiers.some((modifier) => modifier === "Ctrl" || modifier === "Alt" || modifier === "Meta");
}

/** The first key of an action, for a tooltip; nothing when the action has no key. */
export function shortcutHint(keys: readonly string[]): string | undefined {
    const [first] = keys;
    return first === undefined ? undefined : comboLabel(first);
}

export function isReservedCombo(combo: string): boolean {
    return RESERVED_SHORTCUT_KEYS.some((reserved) => reserved === combo);
}
