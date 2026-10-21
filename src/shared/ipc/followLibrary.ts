import { partialMatchKey } from "@tanstack/react-query";
import { toast } from "../ui/Toast";
import { events } from "./bindings";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

/** Screens refresh at most this often while files keep changing on disk (a large copy, a batch rename). */
const REFRESH_INTERVAL_MS = 1000;

/**
 * Keeps the screens in step with the disk: the backend says when files in the library folders changed and when a
 * folder became reachable or not, and whether looking for changes made while the app was closed failed. Call once at
 * the app root; returns the cleanup.
 */
export function followLibrary(): () => void {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const refreshLibrary = () => {
        if (timer !== null) {
            pending = true;
            return;
        }
        // A disk search restarted on every change would never finish while files keep changing (processing, a large
        // copy). It stays under `library` so that actions on its videos still update it.
        void queryClient.invalidateQueries({
            queryKey: queryKeys.library,
            predicate: (query) => !partialMatchKey(query.queryKey, queryKeys.folderSearches()),
        });
        timer = setTimeout(() => {
            timer = null;
            if (pending && active) {
                pending = false;
                refreshLibrary();
            }
        }, REFRESH_INTERVAL_MS);
    };

    const subscriptions = [
        events.libraryChanged.listen(refreshLibrary),
        events.libraryFoldersChanged.listen(
            () => void queryClient.invalidateQueries({ queryKey: queryKeys.libraryFolderStatuses() })
        ),
        events.startupSyncFailed.listen(({ payload }) =>
            toast({
                title: "Couldn't look for changes made while Mnemo was closed",
                description: payload,
                tone: "danger",
            })
        ),
    ];
    return () => {
        // Stopping twice must not unsubscribe twice.
        if (!active) {
            return;
        }
        active = false;
        if (timer !== null) {
            clearTimeout(timer);
        }
        for (const subscription of subscriptions) {
            void subscription.then((unlisten) => unlisten());
        }
    };
}
