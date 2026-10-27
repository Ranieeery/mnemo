//! Keyboard shortcuts: the configurable actions, their defaults and the rules a binding must follow.
//!
//! A binding is a key combination written as modifiers and a key joined by `+`, in a fixed order:
//! `Ctrl+Alt+Shift+Meta+<key>`. The key is the browser's `KeyboardEvent.key`, so layouts work by character: letters
//! are upper case, the space bar is `Space`, `+` is `Plus`, and named keys keep their names (`ArrowLeft`,
//! `Backspace`). `Shift` only appears with named keys; with characters it is part of the character (`?`).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

/// Keys every screen needs for itself (leaving full screen, closing dialogs, the help, moving focus, the zoom keys of
/// `domain::zoom`).
pub const RESERVED_SHORTCUT_KEYS: [&str; 9] = [
    "Escape",
    "?",
    "Tab",
    "Shift+Tab",
    "Enter",
    "Ctrl+=",
    "Ctrl+Plus",
    "Ctrl+-",
    "Ctrl+0",
];

/// Most keys an action can have.
pub const MAX_KEYS_PER_SHORTCUT: usize = 2;

const MODIFIERS: [&str; 4] = ["Ctrl", "Alt", "Shift", "Meta"];

/// Keys known by name, beyond single characters. Escape, Tab and Enter are named so that combinations with them
/// (`Ctrl+Enter`) can be assigned and the plain keys are refused as reserved rather than as malformed.
pub const NAMED_SHORTCUT_KEYS: [&str; 28] = [
    "Space",
    "Plus",
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
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
];

/// The keys of every configurable action. Empty lists are allowed: the action simply has no key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardShortcuts {
    pub play_pause: Vec<String>,
    pub seek_back_10: Vec<String>,
    pub seek_forward_10: Vec<String>,
    pub seek_back_5: Vec<String>,
    pub seek_forward_5: Vec<String>,
    pub volume_up: Vec<String>,
    pub volume_down: Vec<String>,
    pub mute: Vec<String>,
    pub speed_down: Vec<String>,
    pub speed_up: Vec<String>,
    pub speed_reset: Vec<String>,
    pub fullscreen: Vec<String>,
    pub theater: Vec<String>,
    pub subtitles: Vec<String>,
    pub history_back: Vec<String>,
    pub history_forward: Vec<String>,
    pub pin_window: Vec<String>,
    pub mini_player: Vec<String>,
}

fn keys(list: &[&str]) -> Vec<String> {
    list.iter().map(|key| (*key).to_owned()).collect()
}

impl Default for KeyboardShortcuts {
    fn default() -> Self {
        Self {
            play_pause: keys(&["Space", "K"]),
            seek_back_10: keys(&["J"]),
            seek_forward_10: keys(&["L"]),
            seek_back_5: keys(&["ArrowLeft"]),
            seek_forward_5: keys(&["ArrowRight"]),
            volume_up: keys(&["ArrowUp"]),
            volume_down: keys(&["ArrowDown"]),
            mute: keys(&["M"]),
            speed_down: keys(&["["]),
            speed_up: keys(&["]"]),
            speed_reset: keys(&["Backspace"]),
            fullscreen: keys(&["F"]),
            theater: keys(&["T"]),
            subtitles: keys(&["C"]),
            history_back: keys(&["Alt+ArrowLeft"]),
            history_forward: keys(&["Alt+ArrowRight"]),
            pin_window: Vec::new(),
            mini_player: keys(&["I"]),
        }
    }
}

impl KeyboardShortcuts {
    /// Every action with its keys, in a fixed order. When stored keys clash, the earlier action keeps them, so actions
    /// added later go last: a key a user already gave to another action stays there.
    pub fn actions(&self) -> [(&'static str, &Vec<String>); 18] {
        [
            ("playPause", &self.play_pause),
            ("seekBack10", &self.seek_back_10),
            ("seekForward10", &self.seek_forward_10),
            ("seekBack5", &self.seek_back_5),
            ("seekForward5", &self.seek_forward_5),
            ("volumeUp", &self.volume_up),
            ("volumeDown", &self.volume_down),
            ("mute", &self.mute),
            ("speedDown", &self.speed_down),
            ("speedUp", &self.speed_up),
            ("speedReset", &self.speed_reset),
            ("fullscreen", &self.fullscreen),
            ("theater", &self.theater),
            ("subtitles", &self.subtitles),
            ("historyBack", &self.history_back),
            ("historyForward", &self.history_forward),
            ("pinWindow", &self.pin_window),
            ("miniPlayer", &self.mini_player),
        ]
    }

    fn actions_mut(&mut self) -> [&mut Vec<String>; 18] {
        [
            &mut self.play_pause,
            &mut self.seek_back_10,
            &mut self.seek_forward_10,
            &mut self.seek_back_5,
            &mut self.seek_forward_5,
            &mut self.volume_up,
            &mut self.volume_down,
            &mut self.mute,
            &mut self.speed_down,
            &mut self.speed_up,
            &mut self.speed_reset,
            &mut self.fullscreen,
            &mut self.theater,
            &mut self.subtitles,
            &mut self.history_back,
            &mut self.history_forward,
            &mut self.pin_window,
            &mut self.mini_player,
        ]
    }
}

/// Whether `binding` is a well-formed key combination (see the module docs). Reserved keys are well-formed.
pub fn is_valid_binding(binding: &str) -> bool {
    let parts: Vec<&str> = binding.split('+').collect();
    let Some((key, modifiers)) = parts.split_last() else {
        return false;
    };
    // Modifiers appear at most once each, in the fixed order.
    let mut next_allowed = 0;
    for modifier in modifiers {
        match MODIFIERS[next_allowed..].iter().position(|known| known == modifier) {
            Some(offset) => next_allowed += offset + 1,
            None => return false,
        }
    }
    let mut characters = key.chars();
    let single_character = match (characters.next(), characters.next()) {
        (Some(character), None) => !character.is_whitespace() && character != '+' && is_upper_case_form(character),
        _ => false,
    };
    let named = NAMED_SHORTCUT_KEYS.contains(key);
    // With a character, Shift is already part of it ("?" rather than "Shift+/"); "Plus" is the "+" character.
    let character = single_character || *key == "Plus";
    (single_character || named) && !(character && modifiers.contains(&"Shift"))
}

/// Whether `character` is written as the frontend records it: upper case, unless upper-casing turns it into several
/// characters ("ß" becomes "SS"), in which case it keeps its own form.
fn is_upper_case_form(character: char) -> bool {
    let mut upper = character.to_uppercase();
    match (upper.next(), upper.next()) {
        (Some(only), None) => only == character,
        _ => true,
    }
}

/// Checks shortcuts before they are stored: well-formed, not reserved, at most two per action and none used twice.
pub fn validate_shortcuts(shortcuts: &KeyboardShortcuts) -> Result<(), AppError> {
    let mut seen: Vec<(&str, &str)> = Vec::new();
    for (action, bindings) in shortcuts.actions() {
        if bindings.len() > MAX_KEYS_PER_SHORTCUT {
            return Err(AppError::InvalidInput(format!(
                "{action} has {} keys; at most {MAX_KEYS_PER_SHORTCUT} are allowed",
                bindings.len()
            )));
        }
        for binding in bindings {
            if !is_valid_binding(binding) {
                return Err(AppError::InvalidInput(format!(
                    "{binding:?} is not a valid key combination"
                )));
            }
            if RESERVED_SHORTCUT_KEYS.contains(&binding.as_str()) {
                return Err(AppError::InvalidInput(format!(
                    "{binding} is reserved and cannot be assigned"
                )));
            }
            if let Some((owner, _)) = seen.iter().find(|(_, used)| used == binding) {
                return Err(AppError::InvalidInput(format!("{binding} is already used by {owner}")));
            }
            seen.push((action, binding));
        }
    }
    Ok(())
}

/// Makes stored shortcuts usable: drops invalid, reserved and repeated keys (the first action keeps a shared key)
/// and caps each action at two keys. An action left empty only by this cleanup gets its default keys back, minus
/// any now used elsewhere; an action stored empty on purpose stays empty.
pub fn repair_shortcuts(mut shortcuts: KeyboardShortcuts) -> KeyboardShortcuts {
    let defaults = KeyboardShortcuts::default();
    let mut used: Vec<String> = Vec::new();
    let mut emptied = Vec::new();
    for (position, bindings) in shortcuts.actions_mut().into_iter().enumerate() {
        let had_keys = !bindings.is_empty();
        bindings.retain(|binding| {
            let usable = is_valid_binding(binding)
                && !RESERVED_SHORTCUT_KEYS.contains(&binding.as_str())
                && !used.contains(binding);
            if usable {
                used.push(binding.clone());
            }
            usable
        });
        if bindings.len() > MAX_KEYS_PER_SHORTCUT {
            for dropped in bindings.drain(MAX_KEYS_PER_SHORTCUT..) {
                used.retain(|binding| *binding != dropped);
            }
        }
        if had_keys && bindings.is_empty() {
            emptied.push(position);
        }
    }
    let default_keys: Vec<Vec<String>> = defaults.actions().iter().map(|(_, keys)| (*keys).clone()).collect();
    for (position, bindings) in shortcuts.actions_mut().into_iter().enumerate() {
        if emptied.contains(&position) {
            for binding in default_keys.get(position).into_iter().flatten() {
                if !used.contains(binding) {
                    used.push(binding.clone());
                    bindings.push(binding.clone());
                }
            }
        }
    }
    shortcuts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_are_valid() {
        validate_shortcuts(&KeyboardShortcuts::default()).unwrap();
    }

    #[test]
    fn recognizes_well_formed_combinations() {
        for binding in [
            "K",
            "Space",
            "ArrowLeft",
            "Alt+ArrowLeft",
            "Ctrl+Shift+ArrowUp",
            "?",
            "[",
            "Plus",
            "F5",
            "F12",
            "7",
            "É",
            "Shift+Space",
        ] {
            assert!(is_valid_binding(binding), "{binding}");
        }
        for binding in [
            "",
            "k",
            "Ctrl+",
            "Foo+K",
            "Alt+Ctrl+K",
            "Ctrl+Ctrl+K",
            "Shift+?",
            "F13",
            "F0",
            "F01",
            "Spacebar",
            "+",
            " ",
            "é",
            // The frontend records Shift with "+" as plain "Plus", so this one could never fire.
            "Shift+Plus",
        ] {
            assert!(!is_valid_binding(binding), "{binding:?}");
        }
    }

    #[test]
    fn accepts_what_the_frontend_records() {
        // Combinations with the reserved named keys, and "ß", which upper-cases to "SS" and so keeps its own form.
        let shortcuts = KeyboardShortcuts {
            mute: keys(&["Ctrl+Enter", "Shift+Enter"]),
            theater: keys(&["Ctrl+Tab", "Ctrl+Escape"]),
            subtitles: keys(&["ß", "Ctrl+ß"]),
            ..KeyboardShortcuts::default()
        };
        validate_shortcuts(&shortcuts).unwrap();
        assert_eq!(repair_shortcuts(shortcuts.clone()), shortcuts);
    }

    #[test]
    fn reserved_keys_are_well_formed_and_refused_as_reserved() {
        for reserved in RESERVED_SHORTCUT_KEYS {
            assert!(is_valid_binding(reserved), "{reserved}");
            let shortcuts = KeyboardShortcuts {
                mute: keys(&[reserved]),
                ..KeyboardShortcuts::default()
            };
            let Err(AppError::InvalidInput(message)) = validate_shortcuts(&shortcuts) else {
                panic!("{reserved} was accepted");
            };
            assert!(message.contains("reserved"), "{reserved}: {message}");
        }
    }

    #[test]
    fn the_zoom_keys_are_reserved() {
        use crate::domain::zoom::{ZOOM_IN_KEYS, ZOOM_OUT_KEYS, ZOOM_RESET_KEYS};
        for key in ZOOM_IN_KEYS.iter().chain(&ZOOM_OUT_KEYS).chain(&ZOOM_RESET_KEYS) {
            assert!(RESERVED_SHORTCUT_KEYS.contains(key), "{key}");
        }
    }

    #[test]
    fn rejects_reserved_repeated_and_too_many_keys() {
        let reserved = KeyboardShortcuts {
            mute: keys(&["Escape"]),
            ..KeyboardShortcuts::default()
        };
        let shared = KeyboardShortcuts {
            mute: keys(&["F"]),
            ..KeyboardShortcuts::default()
        };
        let twice = KeyboardShortcuts {
            mute: keys(&["M", "M"]),
            ..KeyboardShortcuts::default()
        };
        let three = KeyboardShortcuts {
            mute: keys(&["M", "N", "O"]),
            ..KeyboardShortcuts::default()
        };
        let malformed = KeyboardShortcuts {
            mute: keys(&["m"]),
            ..KeyboardShortcuts::default()
        };
        for shortcuts in [reserved, shared, twice, three, malformed] {
            assert!(matches!(validate_shortcuts(&shortcuts), Err(AppError::InvalidInput(_))));
        }
        let empty = KeyboardShortcuts {
            mute: Vec::new(),
            ..KeyboardShortcuts::default()
        };
        validate_shortcuts(&empty).unwrap();
    }

    #[test]
    fn repairs_stored_shortcuts_action_by_action() {
        let stored = KeyboardShortcuts {
            // Takes "F" from full screen, which comes later and loses it.
            play_pause: keys(&["F", "bad", "Escape"]),
            // Only invalid keys: back to the default.
            mute: keys(&["m"]),
            // Emptied on purpose: stays empty.
            theater: Vec::new(),
            subtitles: keys(&["C", "V", "B"]),
            ..KeyboardShortcuts::default()
        };
        let repaired = repair_shortcuts(stored);
        assert_eq!(repaired.play_pause, ["F"]);
        assert_eq!(repaired.mute, ["M"]);
        assert!(repaired.theater.is_empty());
        assert_eq!(repaired.subtitles, ["C", "V"]);
        // Full screen lost its only key to play/pause and gets nothing back, since "F" is taken.
        assert!(repaired.fullscreen.is_empty());
        validate_shortcuts(&repaired).unwrap();
    }
}
