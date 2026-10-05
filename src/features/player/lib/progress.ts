import type { Video } from "../../../shared/ipc/bindings";

/** While playing, progress is saved at most this often. Pausing, closing and finishing save right away. */
export const SAVE_INTERVAL_MS = 5000;

/** Positions this close to the start or the end are not worth resuming from. */
const RESUME_MARGIN_START_SECONDS = 5;
const RESUME_MARGIN_END_SECONDS = 10;

/**
 * Where playback should start: the saved position of a video in progress, otherwise the beginning. Watched videos
 * start over.
 */
export function resumePosition(video: Video | null, durationSeconds: number): number {
    if (!video || video.isWatched) {
        return 0;
    }
    const saved = video.watchProgressSeconds;
    const resumable =
        saved >= RESUME_MARGIN_START_SECONDS &&
        (durationSeconds <= 0 || saved <= durationSeconds - RESUME_MARGIN_END_SECONDS);
    return resumable ? saved : 0;
}

/**
 * Decides when to persist the playback position: throttled while playing, immediately on pause/close, and once with
 * `finished` at the end. Never saves the same position twice in a row.
 */
export class ProgressSaver {
    private lastSavedAt = Number.NEGATIVE_INFINITY;
    private lastSavedPosition: number | null = null;

    constructor(
        private readonly save: (positionSeconds: number, finished: boolean) => void,
        private readonly now: () => number = Date.now
    ) {}

    /** Called on every time update while playing. */
    tick(positionSeconds: number) {
        if (positionSeconds > 0 && this.now() - this.lastSavedAt >= SAVE_INTERVAL_MS) {
            this.commit(positionSeconds, false);
        }
    }

    /** Called when playback pauses or the player closes. */
    flush(positionSeconds: number) {
        if (positionSeconds > 0 && positionSeconds !== this.lastSavedPosition) {
            this.commit(positionSeconds, false);
        }
    }

    /** Called when playback reaches the end. */
    finish(positionSeconds: number) {
        this.commit(positionSeconds, true);
    }

    private commit(positionSeconds: number, finished: boolean) {
        this.lastSavedAt = this.now();
        this.lastSavedPosition = positionSeconds;
        this.save(positionSeconds, finished);
    }
}
