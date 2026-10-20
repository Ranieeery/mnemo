import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
    commands,
    type FolderColor,
    type LibraryFolder,
    type LibraryFolderSort,
    type RelocationResult,
} from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { joinPath, relativeSegments } from "../../shared/lib/paths";
import { plural } from "../../shared/lib/plural";
import { processFolder } from "../../shared/stores/processing";
import { toast } from "../../shared/ui";

/** Asks for a folder with the native dialog, adds it and starts reading its videos in the background. */
export function useAddLibraryFolder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (): Promise<LibraryFolder | null> => {
            const selected = await open({ directory: true, multiple: false, title: "Add a folder to the library" });
            return typeof selected === "string" ? call(commands.addLibraryFolder(selected)) : null;
        },
        onSuccess: async (folder) => {
            if (!folder) {
                return;
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
            toast({
                title: `Added ${folder.name}`,
                description: "New videos appear as they are read.",
                tone: "success",
            });
            // Forced: the folder may have been read earlier in this session, before being removed.
            void processFolder(folder.path, { force: true });
        },
        onError: (error) => {
            toast({ title: "Could not add the folder", description: errorMessage(error), tone: "danger" });
        },
    });
}

export function useRemoveLibraryFolder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (folder: LibraryFolder) => call(commands.removeLibraryFolder(folder.path)),
        onSuccess: async (removedVideos, folder) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
            toast({
                title: `Removed ${folder.name}`,
                description: `${removedVideos} videos removed from the library. Files on disk were not touched.`,
                tone: "success",
            });
        },
        onError: (error) => {
            toast({ title: "Could not remove the folder", description: errorMessage(error), tone: "danger" });
        },
    });
}

/** Icons chosen most recently, newest first; saving an icon adds it (and refreshes this through the library key). */
export function useRecentFolderIcons() {
    return useQuery({
        queryKey: queryKeys.recentFolderIcons(),
        queryFn: () => call(commands.recentFolderIcons()),
    });
}

/** Saves a library folder's icon and its color; `null` restores each default. */
export function useSetFolderAppearance() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            folder,
            icon,
            color,
        }: {
            folder: LibraryFolder;
            icon: string | null;
            color: FolderColor | null;
        }) => call(commands.setLibraryFolderAppearance(folder.path, icon, color)),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.library }),
        onError: (error) => {
            toast({ title: "Could not change the icon", description: errorMessage(error), tone: "danger" });
        },
    });
}

/** What `to` would give as the new location of the library folder `from`; nothing changes yet. */
export function useFolderRelocationCheck(from: string, to: string | null) {
    return useQuery({
        queryKey: queryKeys.folderRelocation(from, to ?? ""),
        queryFn: () => call(commands.checkFolderRelocation(from, to ?? "")),
        enabled: to !== null,
        // The disk can change between two looks, so every pick is checked afresh.
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
}

/**
 * Points an unreachable library folder at its new location. The screen showing a folder inside it moves along, so
 * it does not stay on a path that no longer belongs to the library.
 */
export function useRelocateFolder() {
    const queryClient = useQueryClient();
    const router = useRouter();
    return useMutation({
        mutationFn: ({ from, to }: { from: string; to: string }) => call(commands.relocateLibraryFolder(from, to)),
        onSuccess: async (result, { from, to }) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.library }),
                queryClient.invalidateQueries({ queryKey: queryKeys.libraryFolderStatuses() }),
            ]);
            toast({ title: `Located ${result.folder.name}`, description: relocationSummary(result), tone: "success" });
            const { pathname, search } = router.state.location;
            const segments =
                pathname === "/folder" && "path" in search && typeof search.path === "string"
                    ? relativeSegments(search.path, from)
                    : null;
            if (segments) {
                await router.navigate({ to: "/folder", search: { path: joinPath(to, ...segments) }, replace: true });
            }
        },
    });
}

function relocationSummary({ totalVideos, foundVideos }: RelocationResult): string {
    if (totalVideos === 0) {
        return "Its videos are read from the new location.";
    }
    const found = `${foundVideos} of ${plural(totalVideos, "video")} found.`;
    return foundVideos === totalVideos ? found : `${found} The others keep their data and are listed as missing.`;
}

export function useLibraryFolderSort() {
    return useQuery({
        queryKey: queryKeys.libraryFolderSort(),
        queryFn: () => call(commands.getLibraryFolderSort()),
    });
}

/** Shows the folders in the order the backend returned, wherever they are listed. */
async function showFolderOrder(queryClient: QueryClient, sort: LibraryFolderSort, folders: LibraryFolder[]) {
    queryClient.setQueryData(queryKeys.libraryFolderSort(), sort);
    queryClient.setQueryData(queryKeys.libraryFolders(), folders);
    // The home lists its folder previews in the same order.
    await queryClient.invalidateQueries({ queryKey: queryKeys.homeSections() });
}

export function useSetLibraryFolderSort() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (sort: LibraryFolderSort) => call(commands.setLibraryFolderSort(sort)),
        onSuccess: (folders, sort) => showFolderOrder(queryClient, sort, folders),
        onError: (error) => {
            toast({ title: "Could not sort the folders", description: errorMessage(error), tone: "danger" });
        },
    });
}

/**
 * Saves `folders` (as listed on screen, after the move) as the custom order and switches to it. The new order shows
 * at once and goes back if it cannot be saved.
 */
export function useReorderLibraryFolders() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (folders: LibraryFolder[]) =>
            call(commands.reorderLibraryFolders(folders.map((folder) => folder.id))),
        onMutate: async (folders) => {
            await Promise.all([
                queryClient.cancelQueries({ queryKey: queryKeys.libraryFolders() }),
                queryClient.cancelQueries({ queryKey: queryKeys.libraryFolderSort() }),
            ]);
            const previous = {
                folders: queryClient.getQueryData<LibraryFolder[]>(queryKeys.libraryFolders()),
                sort: queryClient.getQueryData<LibraryFolderSort>(queryKeys.libraryFolderSort()),
            };
            queryClient.setQueryData(queryKeys.libraryFolders(), folders);
            queryClient.setQueryData<LibraryFolderSort>(queryKeys.libraryFolderSort(), "custom");
            return previous;
        },
        onSuccess: (folders) => showFolderOrder(queryClient, "custom", folders),
        onError: (error, _folders, previous) => {
            queryClient.setQueryData(queryKeys.libraryFolders(), previous?.folders);
            queryClient.setQueryData(queryKeys.libraryFolderSort(), previous?.sort);
            toast({ title: "Could not move the folder", description: errorMessage(error), tone: "danger" });
        },
    });
}
