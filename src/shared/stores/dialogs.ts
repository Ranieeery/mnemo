import { create } from "zustand";
import type { Video } from "../ipc/bindings";

/**
 * Dialogs that any screen can open (from a video card, the player, search results) and that the app root renders
 * once, composed from several features.
 */
type DialogState = {
    videoDetails: Video | null;
    /** The keyboard shortcuts help, opened with "?" or the keyboard button. */
    shortcutsHelp: boolean;
};

export const useDialogStore = create<DialogState>(() => ({ videoDetails: null, shortcutsHelp: false }));

/** Closes every dialog. The store outlives screens, so tests start each case with none open. */
export function resetDialogs() {
    useDialogStore.setState({ videoDetails: null, shortcutsHelp: false });
}

export function openShortcutsHelp() {
    useDialogStore.setState({ shortcutsHelp: true });
}

export function closeShortcutsHelp() {
    useDialogStore.setState({ shortcutsHelp: false });
}

export function openVideoDetails(video: Video) {
    useDialogStore.setState({ videoDetails: video });
}

export function closeVideoDetails() {
    useDialogStore.setState({ videoDetails: null });
}
