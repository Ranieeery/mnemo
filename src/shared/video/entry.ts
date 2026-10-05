import type { Video, VideoEntry } from "../ipc/bindings";

/** Title to show: the library title once processed, otherwise the file name without its extension. */
export function entryTitle(entry: VideoEntry): string {
    return entry.video?.title ?? entry.name.replace(/\.[^.]+$/, "");
}

/** A processed video as an entry, for views that only list library records (home, library search). */
export function toEntry(video: Video): VideoEntry {
    const name = video.filePath.split(/[\\/]/).at(-1) ?? video.filePath;
    return { path: video.filePath, name, video };
}

/** Fraction of the video watched, between 0 and 1. */
export function watchedFraction(video: Video): number {
    return video.durationSeconds > 0 ? Math.min(1, video.watchProgressSeconds / video.durationSeconds) : 0;
}
