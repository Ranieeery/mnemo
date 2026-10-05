import { create } from "zustand";
import type { Video } from "../ipc/bindings";

/**
 * Dialogs that any screen can open (from a video card, the player, search results) and that the app root renders
 * once, composed from several features.
 */
type DialogState = {
    videoDetails: Video | null;
};

export const useDialogStore = create<DialogState>(() => ({ videoDetails: null }));

export function openVideoDetails(video: Video) {
    useDialogStore.setState({ videoDetails: video });
}

export function closeVideoDetails() {
    useDialogStore.setState({ videoDetails: null });
}
