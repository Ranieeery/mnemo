import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { commands, type ProcessingEvent, type ProcessingSummary } from "../ipc/bindings";
import { call, errorMessage, isErrorKind } from "../ipc/client";
import { queryClient } from "../ipc/queryClient";
import { queryKeys } from "../ipc/queryKeys";
import { isWithin } from "../lib/paths";
import { toast } from "../ui";

/** The job currently extracting metadata and thumbnails. Only set while there is actual work to show. */
export type ProcessingJob = {
    folder: string;
    done: number;
    total: number;
    currentFile: string;
};

export const useProcessingStore = create<{ job: ProcessingJob | null }>(() => ({ job: null }));

/** Folders already processed in this session; opening them (or a subfolder) again does not walk the disk again. */
const processedThisSession = new Set<string>();

type ProcessOptions = {
    /** Process even if the folder was handled this session (used by "Sync folder"). */
    force?: boolean;
    /** Tell the user what was found when done. */
    report?: boolean;
};

/**
 * Processes the new videos below `folder` in the background. The backend runs one job at a time and skips videos
 * already in the library, so calling this for a folder that is up to date is cheap. Returns `null` when skipped.
 */
export async function processFolder(folder: string, { force = false, report = false }: ProcessOptions = {}) {
    const alreadyDone = [...processedThisSession].some((done) => isWithin(folder, done));
    if (alreadyDone && !force) {
        return null;
    }
    processedThisSession.add(folder);

    const channel = new Channel<ProcessingEvent>((event) => {
        if (event.event === "progress") {
            useProcessingStore.setState({ job: { folder, ...event.data } });
        }
    });

    try {
        const summary: ProcessingSummary = await call(commands.processFolder(folder, channel));
        if (summary.processed > 0) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
        }
        if (report) {
            toast({
                title: summary.processed > 0 ? `Added ${summary.processed} new videos` : "Folder is up to date",
                description: summary.failed > 0 ? `${summary.failed} files could not be read.` : undefined,
                tone: "success",
            });
        }
        return summary;
    } catch (error) {
        processedThisSession.delete(folder);
        if (isErrorKind(error, "mediaToolMissing")) {
            // The shell shows how to install ffmpeg; refreshing the status brings that message up.
            await queryClient.invalidateQueries({ queryKey: queryKeys.mediaTools() });
        } else {
            toast({ title: "Could not process the folder", description: errorMessage(error), tone: "danger" });
        }
        return null;
    } finally {
        if (useProcessingStore.getState().job?.folder === folder) {
            useProcessingStore.setState({ job: null });
        }
    }
}

/** Test hook: forget which folders were processed. */
export function resetProcessingSession() {
    processedThisSession.clear();
    useProcessingStore.setState({ job: null });
}
