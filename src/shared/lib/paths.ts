/**
 * Display-side path helpers. Paths come from the backend in the platform's own format; these functions only split
 * and compare them, they never resolve anything on disk.
 */

/** The separator a path uses: backslash for Windows paths, slash otherwise. */
export function pathSeparator(path: string): "\\" | "/" {
    return path.includes("\\") ? "\\" : "/";
}

function trimTrailingSeparator(path: string): string {
    return path.length > 1 ? path.replace(/[\\/]+$/, "") : path;
}

/** Whether `path` is `folder` itself or lies inside it (whole components only: `Show 2` is not inside `Show`). */
export function isWithin(path: string, folder: string): boolean {
    const base = trimTrailingSeparator(folder);
    const target = trimTrailingSeparator(path);
    if (target === base) {
        return true;
    }
    return target.startsWith(base) && (target[base.length] === "\\" || target[base.length] === "/");
}

/** Path components of `path` below `folder`, or `null` when it is not inside it. */
export function relativeSegments(path: string, folder: string): string[] | null {
    if (!isWithin(path, folder)) {
        return null;
    }
    const rest = trimTrailingSeparator(path).slice(trimTrailingSeparator(folder).length);
    return rest.split(/[\\/]/).filter(Boolean);
}

/** Joins segments onto a base path with the base's own separator. */
export function joinPath(base: string, ...segments: string[]): string {
    const separator = pathSeparator(base);
    return [trimTrailingSeparator(base), ...segments].join(separator);
}

/** Last component of a path, or the path itself for roots like `D:\`. */
export function baseName(path: string): string {
    return trimTrailingSeparator(path).split(/[\\/]/).at(-1) || path;
}

/** Folder that contains `path`, or `path` itself when it has no parent. */
export function parentPath(path: string): string {
    const trimmed = trimTrailingSeparator(path);
    const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
    return index > 0 ? trimmed.slice(0, index) : path;
}
