import { create } from "zustand";
import {
    commands,
    events,
    type LibraryFolder,
    type ProcessingOutcome,
    type ProcessingStatus,
    type ProcessingSummary,
} from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { queryClient } from "../ipc/queryClient";
import { queryKeys } from "../ipc/queryKeys";
import { folderName } from "../lib/folderName";
import { isWithin } from "../lib/paths";
import { plural } from "../lib/plural";
import { toast } from "../ui";

const IDLE: ProcessingStatus = { jobs: [], inFlight: [], cancelling: false, errors: [] };

/** What the background pipeline is doing, as the backend last reported it. */
export const useProcessingStore = create<{ status: ProcessingStatus }>(() => ({ status: IDLE }));

/** Folders already read in this session; opening them (or a subfolder) again does not walk the disk again. */
const processedThisSession = new Set<string>();

/** Callers waiting for the end of a job, by its id (see `syncFolders`). */
let waiters: { job: number; resolve: (outcome: ProcessingOutcome) => void }[] = [];
/** Jobs that ended while a sync was still waiting for its job ids: a job may end before the request returns. */
const endedDuringSync = new Map<number, ProcessingOutcome>();
let syncsStarting = 0;

/**
 * Follows the pipeline: its status and the end of each job. Call once at the app root; returns the cleanup. Jobs run
 * in the backend, so they keep going (and report) whatever screen is open.
 */
export function followProcessing(): () => void {
    let active = true;
    // The status sent by an event is newer than the one asked for at the start, whichever arrives last.
    let heard = false;
    const subscriptions = [
        events.processingStatusChanged.listen((event) => {
            heard = true;
            useProcessingStore.setState({ status: event.payload });
        }),
        events.processingFinished.listen((event) => void finished(event.payload)),
    ];
    commands
        .getProcessingStatus()
        .then((status) => {
            if (active && !heard) {
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

/** Toasts outside React read the library folders from the cache, to name one by its name in the app. */
function libraryAwareName(path: string): string {
    return folderName(path, queryClient.getQueryData<LibraryFolder[]>(queryKeys.libraryFolders()));
}

async function finished(outcome: ProcessingOutcome) {
    const name = libraryAwareName(outcome.folder);
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
        // A folder removed from the library needs no word: the user just asked for it.
        if (!outcome.removed) {
            toast({
                title: `Stopped reading videos in ${name}`,
                description: `${plural(processed, "new video")} added; the rest is left for later.`,
            });
        }
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
    if (syncsStarting > 0) {
        endedDuringSync.set(outcome.job, outcome);
    }
    const [done, waiting] = partition(waiters, (waiter) => waiter.job === outcome.job);
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
        toast({
            title: `Could not read ${libraryAwareName(folder)}`,
            description: errorMessage(error),
            tone: "danger",
        });
    }
}

/** Reads every folder now and resolves once all of them ended, with their combined summary. */
export async function syncFolders(folders: readonly string[]): Promise<ProcessingSummary> {
    syncsStarting += 1;
    let ends: Promise<ProcessingOutcome>[];
    try {
        // A folder inside one already being read answers with that job, so the same id may cover several folders.
        const jobs = await call(commands.processFolders([...folders], false));
        ends = [...new Set(jobs)].map((job) => {
            const ended = endedDuringSync.get(job);
            return ended
                ? Promise.resolve(ended)
                : new Promise<ProcessingOutcome>((resolve) => waiters.push({ job, resolve }));
        });
    } finally {
        syncsStarting -= 1;
        if (syncsStarting === 0) {
            endedDuringSync.clear();
        }
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
    endedDuringSync.clear();
    syncsStarting = 0;
    useProcessingStore.setState({ status: IDLE });
}
