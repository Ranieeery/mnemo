import type { LibraryFolder } from "../ipc/bindings";
import { baseName, relativeSegments } from "./paths";

/** The name the app shows for a folder: a library folder goes by its name in the app, any other by its own. */
export function folderName(path: string, libraryFolders: readonly LibraryFolder[] | undefined): string {
    const folder = libraryFolders?.find((candidate) => relativeSegments(path, candidate.path)?.length === 0);
    return folder?.name ?? baseName(path);
}
