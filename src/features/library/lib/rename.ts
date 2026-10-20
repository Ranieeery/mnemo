import type { LibraryFolder } from "../../../shared/ipc/bindings";

/**
 * The folder as it will look once `input` is saved as its name, shown before the backend answers (which has the
 * last word). An empty value, or the folder's own name, shows the folder's own name again.
 */
export function renamed(folder: LibraryFolder, input: string): LibraryFolder {
    const name = input.trim();
    const customName = name === "" || name === folder.folderName ? null : name;
    return { ...folder, name: customName ?? folder.folderName, customName };
}
