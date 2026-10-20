import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands, type LibraryEntry, type LibraryFolder, type LibraryGroup } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { plural } from "../../shared/lib/plural";
import { toast } from "../../shared/ui";
import { flatFolders, mapGroup, moveToGroup } from "./lib/folderLayout";

/** Shows `update` at once in the library as the sidebar lists it, returning what to put back if the change fails. */
async function updateLayout(queryClient: QueryClient, update: (entries: LibraryEntry[]) => LibraryEntry[]) {
    await queryClient.cancelQueries({ queryKey: queryKeys.libraryLayout() });
    const previous = queryClient.getQueryData<LibraryEntry[]>(queryKeys.libraryLayout());
    if (previous !== undefined) {
        queryClient.setQueryData<LibraryEntry[]>(queryKeys.libraryLayout(), update(previous));
    }
    return previous;
}

function putLayoutBack(queryClient: QueryClient, previous: LibraryEntry[] | undefined) {
    queryClient.setQueryData(queryKeys.libraryLayout(), previous);
}

/** Everything that lists the folders (the sidebar, the home, Settings) is read again. */
function refreshLibrary(queryClient: QueryClient) {
    return queryClient.invalidateQueries({ queryKey: queryKeys.library });
}

function failed(title: string) {
    return (error: unknown) => toast({ title, description: errorMessage(error), tone: "danger" });
}

/** Creates a group at the end of the list; with a folder, the folder moves into it at the same time. */
export function useCreateLibraryGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ name, folder }: { name: string; folder: LibraryFolder | null }) =>
            call(commands.createLibraryGroup(name, folder?.id ?? null)),
        onSuccess: () => refreshLibrary(queryClient),
        onError: failed("Could not create the group"),
    });
}

export function useRenameLibraryGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ group, name }: { group: LibraryGroup; name: string }) =>
            call(commands.renameLibraryGroup(group.id, name)),
        onMutate: ({ group, name }) =>
            updateLayout(queryClient, (entries) =>
                mapGroup(entries, group.id, (candidate) => ({ ...candidate, name: name.trim() }))
            ),
        onError: (error, _variables, previous) => {
            putLayoutBack(queryClient, previous);
            failed("Could not rename the group")(error);
        },
        // An order by name changes with it.
        onSettled: () => refreshLibrary(queryClient),
    });
}

/** Expands or collapses a group in the sidebar; kept between sessions. */
export function useSetLibraryGroupCollapsed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ group, collapsed }: { group: LibraryGroup; collapsed: boolean }) =>
            call(commands.setLibraryGroupCollapsed(group.id, collapsed)),
        onMutate: ({ group, collapsed }) =>
            updateLayout(queryClient, (entries) =>
                mapGroup(entries, group.id, (candidate) => ({ ...candidate, collapsed }))
            ),
        onError: (error, { collapsed }, previous) => {
            putLayoutBack(queryClient, previous);
            failed(collapsed ? "Could not collapse the group" : "Could not expand the group")(error);
        },
    });
}

/** Deletes a group; its folders stay where it was, without a group. */
export function useDeleteLibraryGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (group: LibraryGroup) => call(commands.deleteLibraryGroup(group.id)),
        onSuccess: async (folders, group) => {
            await refreshLibrary(queryClient);
            toast({
                title: `Deleted ${group.name}`,
                description: folders > 0 ? `${plural(folders, "folder")} moved out of the group.` : undefined,
                tone: "success",
            });
        },
        onError: failed("Could not delete the group"),
    });
}

/**
 * Puts a folder at the end of a group (`null` takes it out of its group, to the end of the list). The sort mode
 * stays, so the backend's list (read again) has the last word on where it shows.
 */
export function useMoveFolderToGroup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ folder, group }: { folder: LibraryFolder; group: LibraryGroup | null }) =>
            call(commands.moveLibraryFolderToGroup(folder.id, group?.id ?? null)),
        onMutate: async ({ folder, group }) => {
            const previous = await updateLayout(queryClient, (entries) =>
                moveToGroup(entries, folder.id, group?.id ?? null)
            );
            const moved = queryClient.getQueryData<LibraryEntry[]>(queryKeys.libraryLayout());
            if (moved) {
                queryClient.setQueryData(queryKeys.libraryFolders(), flatFolders(moved));
            }
            return previous;
        },
        onError: (error, _variables, previous) => {
            putLayoutBack(queryClient, previous);
            failed("Could not move the folder")(error);
        },
        onSettled: () => refreshLibrary(queryClient),
    });
}
