import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commands, type HiddenFolder } from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { useHiddenFolders } from "../ipc/queries";
import { queryKeys } from "../ipc/queryKeys";
import { isWithin } from "../lib/paths";
import { toast } from "../ui";

/** Whether a folder's videos show on the home page and in the history. */
export type FolderVisibility =
    | { kind: "visible" }
    | { kind: "hidden" }
    /** Inside a hidden folder (the nearest one): hidden with it. */
    | { kind: "insideHidden"; folder: HiddenFolder };

/**
 * The nearest hidden folder that is `path` or contains it. Every hidden folder around a path contains this one, so
 * a place inside it is inside all of them.
 */
export function nearestHiddenFolder(path: string, hidden: readonly HiddenFolder[]): HiddenFolder | undefined {
    return hidden
        .filter((folder) => isWithin(path, folder.path))
        .reduce<HiddenFolder | undefined>(
            (nearest, folder) => (nearest && isWithin(nearest.path, folder.path) ? nearest : folder),
            undefined
        );
}

export function folderVisibility(path: string, hidden: readonly HiddenFolder[]): FolderVisibility {
    const folder = nearestHiddenFolder(path, hidden);
    if (!folder) {
        return { kind: "visible" };
    }
    return isWithin(folder.path, path) ? { kind: "hidden" } : { kind: "insideHidden", folder };
}

/** The visibility of a folder; visible until the hidden folders load. */
export function useFolderVisibility(path: string): FolderVisibility {
    return folderVisibility(path, useHiddenFolders().data ?? []);
}

/** Hides a folder from the home page and the history, or shows it again; every view refreshes. */
export function useSetFolderHidden() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ path, hidden }: { path: string; name: string; hidden: boolean }) =>
            call(commands.setFolderHidden(path, hidden)),
        onSuccess: (_result, { name, hidden }) => {
            toast({
                title: hidden ? `${name} is hidden from home and history` : `${name} shows on home and history again`,
                tone: "success",
            });
        },
        onError: (error, { hidden }) => {
            toast({
                title: hidden ? "Could not hide the folder" : "Could not show the folder",
                description: errorMessage(error),
                tone: "danger",
            });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.library }),
    });
}
