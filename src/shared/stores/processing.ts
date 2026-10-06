import { create } from "zustand";
import {
    commands,
    events,
    type ProcessingOutcome,
    type ProcessingStatus,
    type ProcessingSummary,
} from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { queryClient } from "../ipc/queryClient";
import { queryKeys } from "../ipc/queryKeys";
import { baseName, isWithin } from "../lib/paths";
import { plural } from "../lib/plural";
import { toast } from "../ui";

const IDLE: ProcessingStatus = { jobs: [], inFlight: [], cancelling: false, errors: [] };

/** What the background pipeline is doing, as the backend last reported it. */
export const useProcessingStore = create<{ status: ProcessingStatus }>(() => ({ status: IDLE }));

/** Folders already read in this session; opening them (or a subfolder) again does not walk the disk again. */
const processedThisSession = new Set<string>();

/** Callers waiting for the end of the jobs covering their folders (see `syncFolders`). */
let waiters: { folder: string; resolve: (outcome: ProcessingOutcome) => void }[] = [];

/**
 * Follows the pipeline: its status and the end of each job. Call once at the app root; returns the cleanup. Jobs run
 * in the backend, so they keep going (and report) whatever screen is open.
 */
export function followProcessing(): () => void {
    let active = true;
    const subscriptions = [
        events.processingStatusChanged.listen((event) => useProcessingStore.setState({ status: event.payload })),
        events.processingFinished.listen((event) => void finished(event.payload)),
    ];
    commands
        .getProcessingStatus()
        .then((status) => {
            if (active) {
                useProcessingStore.setState({ status });
            }
        })
        .catch((error: unknown) => {
            // Background reading still works; only the progress bar may lag until the next update.
            toast({
                title: "Could not read the background progress",
                description: errorMessage(error),
                tone: "danger",
            });
        });
    return () => {
        // Stopping twice must not unsubscribe twice.
        if (!active) {
            return;
        }
        active = false;
        for (const subscription of subscriptions) {
            void subscription.then((unlisten) => unlisten());
        }
    };
}

async function finished(outcome: ProcessingOutcome) {
    const name = baseName(outcome.folder);
    const { processed, failed } = outcome.summary;
    if (outcome.cancelled || outcome.error !== null || outcome.missingTool) {
        // Not read to the end: opening the folder again resumes it.
        for (const folder of processedThisSession) {
            if (isWithin(folder, outcome.folder)) {
                processedThisSession.delete(folder);
            }
        }
    }
    if (outcome.missingTool) {
        // The shell explains how to install ffmpeg; refreshing the status brings that message up.
        await queryClient.invalidateQueries({ queryKey: queryKeys.mediaTools() });
    } else if (outcome.error !== null) {
        toast({ title: `Could not read ${name}`, description: outcome.error, tone: "danger" });
    } else if (outcome.cancelled) {
        toast({
            title: `Stopped reading videos in ${name}`,
            description: `${plural(processed, "new video")} added; the rest is left for later.`,
        });
    } else if (outcome.report) {
        toast({
            title: processed > 0 ? `Added ${plural(processed, "new video")} to ${name}` : `${name} is up to date`,
            description: failed > 0 ? `${plural(failed, "file")} could not be read.` : undefined,
            tone: "success",
        });
    }
    if (processed > 0) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.library });
    }
    const [done, waiting] = partition(waiters, (waiter) => isWithin(waiter.folder, outcome.folder));
    waiters = waiting;
    for (const waiter of done) {
        waiter.resolve(outcome);
    }
}

type ProcessOptions = {
    /** Read even if the folder was handled this session (used by "Sync folder"). */
    force?: boolean;
    /** Tell the user what was found when done. */
    report?: boolean;
};

/**
 * Queues the new videos below `folder` to be read in the background. The backend skips videos already in the
 * library and folders already queued, so calling this for a folder that is up to date is cheap.
 */
export async function processFolder(folder: string, { force = false, report = false }: ProcessOptions = {}) {
    const alreadyDone = [...processedThisSession].some((done) => isWithin(folder, done));
    if (alreadyDone && !force) {
        return;
    }
    processedThisSession.add(folder);
    try {
        await call(commands.processFolders([folder], report));
    } catch (error) {
        processedThisSession.delete(folder);
        toast({ title: `Could not read ${baseName(folder)}`, description: errorMessage(error), tone: "danger" });
    }
}

/** Reads every folder now and resolves once all of them ended, with their combined summary. */
export async function syncFolders(folders: readonly string[]): Promise<ProcessingSummary> {
    const ends = folders.map(
        (folder) => new Promise<ProcessingOutcome>((resolve) => waiters.push({ folder, resolve }))
    );
    try {
        await call(commands.processFolders([...folders], false));
    } catch (error) {
        waiters = waiters.filter((waiter) => !folders.includes(waiter.folder));
        throw error;
    }
    for (const folder of folders) {
        processedThisSession.add(folder);
    }
    const outcomes = await Promise.all(ends);
    return outcomes.reduce<ProcessingSummary>(
        (total, { summary }) => ({
            processed: total.processed + summary.processed,
            skipped: total.skipped + summary.skipped,
            failed: total.failed + summary.failed,
        }),
        { processed: 0, skipped: 0, failed: 0 }
    );
}

/** Stops reading the videos of `folder`, or of every folder. Running ffmpeg processes are killed. */
export function cancelProcessing(folder: string | null = null) {
    void commands.cancelProcessing(folder);
}

function partition<T>(items: readonly T[], test: (item: T) => boolean): [T[], T[]] {
    return [items.filter(test), items.filter((item) => !test(item))];
}

/** Test hook: forget which folders were read and what the pipeline reported. */
export function resetProcessingSession() {
    processedThisSession.clear();
    waiters = [];
    useProcessingStore.setState({ status: IDLE });
}
