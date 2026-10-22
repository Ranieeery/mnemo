import type { Video, VideoEntry } from "../ipc/bindings";
import { formatDuration } from "../lib/formatDuration";
import { baseName } from "../lib/paths";

/** Title to show: the library title once processed, otherwise the file name without its extension. */
export function entryTitle(entry: VideoEntry): string {
    return entry.video?.title ?? entry.name.replace(/\.[^.]+$/, "");
}

/** A processed video as an entry, for views that only list library records (home, library search). */
export function toEntry(video: Video): VideoEntry {
    return { path: video.filePath, name: baseName(video.filePath), video };
}

/** Fraction of the video watched, between 0 and 1. */
export function watchedFraction(video: Video): number {
    return video.durationSeconds > 0 ? Math.min(1, video.watchProgressSeconds / video.durationSeconds) : 0;
}

/**
 * What a card shows besides its title, in words for screen readers: the progress strip, the duration, the detail line
 * and the "Not processed" badge.
 */
export function entryDescription(entry: VideoEntry, detail?: string): string {
    const { video } = entry;
    const parts: string[] = [];
    if (video) {
        const fraction = watchedFraction(video);
        // Same rule as the strip on the thumbnail; never "0%" for a video that was started.
        if (!video.isWatched && fraction > 0 && fraction < 1) {
            parts.push(`${Math.max(1, Math.floor(fraction * 100))}% watched`);
        }
        if (video.durationSeconds > 0) {
            parts.push(formatDuration(video.durationSeconds));
        }
    }
    if (detail) {
        parts.push(detail);
    }
    if (!video) {
        parts.push("Not processed");
    }
    return parts.join(", ");
}
