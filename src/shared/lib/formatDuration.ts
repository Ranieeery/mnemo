/**
 * Formats a duration in seconds as `m:ss`, or `h:mm:ss` from one hour up.
 * Missing, negative or non-finite values render as `0:00`.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
    if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return "0:00";
    }

    const wholeSeconds = Math.floor(totalSeconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const seconds = String(wholeSeconds % 60).padStart(2, "0");

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
    }
    return `${minutes}:${seconds}`;
}
