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
    /** Path of the unreachable library folder being located, from the sidebar or the folder screen. */
    folderRelocation: string | null;
};

export const useDialogStore = create<DialogState>(() => ({
    videoDetails: null,
    shortcutsHelp: false,
    folderRelocation: null,
}));

/** Closes every dialog. The store outlives screens, so tests start each case with none open. */
export function resetDialogs() {
    useDialogStore.setState({ videoDetails: null, shortcutsHelp: false, folderRelocation: null });
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

/** Starts locating the library folder `path`: the folder picker opens first, then the dialog with what it found. */
export function openFolderRelocation(path: string) {
    useDialogStore.setState({ folderRelocation: path });
}

export function closeFolderRelocation() {
    useDialogStore.setState({ folderRelocation: null });
}
