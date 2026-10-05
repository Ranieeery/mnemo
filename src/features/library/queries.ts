import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type LibraryFolder } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
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
            void processFolder(folder.path);
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

export function useSetFolderIcon() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ folder, icon }: { folder: LibraryFolder; icon: string | null }) =>
            call(commands.setLibraryFolderIcon(folder.path, icon)),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.library }),
        onError: (error) => {
            toast({ title: "Could not change the icon", description: errorMessage(error), tone: "danger" });
        },
    });
}
