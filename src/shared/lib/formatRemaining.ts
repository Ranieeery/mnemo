/**
 * How much of a video is left, in words: "8 min left", "1 h 5 min left", "Under a minute left". Minutes round up, so
 * 7 min 30 s reads as "8 min left" and the last seconds never read as "0 min". Invalid values count as nothing watched.
 */
export function formatRemaining(durationSeconds: number, watchedSeconds: number): string {
    const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
    const watched = Number.isFinite(watchedSeconds) ? Math.max(0, watchedSeconds) : 0;
    const remaining = Math.max(0, duration - watched);
    if (remaining < 60) {
        return "Under a minute left";
    }
    const totalMinutes = Math.ceil(remaining / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes} min left`;
    }
    return minutes === 0 ? `${hours} h left` : `${hours} h ${minutes} min left`;
}
