import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { baseName, isWithin, joinPath, relativeSegments } from "../../../shared/lib/paths";

export type Crumb = { name: string; path: string };

/** Trail from the library folder that contains `path` down to `path` itself. */
export function breadcrumbs(path: string, libraryFolders: readonly LibraryFolder[]): Crumb[] {
    const root = libraryFolders
        .filter((folder) => isWithin(path, folder.path))
        .sort((a, b) => b.path.length - a.path.length)[0];
    if (!root) {
        return [{ name: baseName(path), path }];
    }
    const segments = relativeSegments(path, root.path) ?? [];
    return [
        { name: root.name, path: root.path },
        ...segments.map((segment, index) => ({
            name: segment,
            path: joinPath(root.path, ...segments.slice(0, index + 1)),
        })),
    ];
}
