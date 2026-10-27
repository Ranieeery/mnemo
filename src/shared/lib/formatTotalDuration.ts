/** A whole number of minutes in words: "5 min", "2 h", "2 h 5 min". */
export function hoursAndMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes} min`;
    }
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * How long a set of videos lasts, to the nearest minute: "10 h 42 min", "26 min", "Under a minute". Missing, negative
 * or non-finite values count as nothing.
 */
export function formatTotalDuration(totalSeconds: number | null | undefined): string {
    const seconds = totalSeconds != null && Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
    const totalMinutes = Math.round(seconds / 60);
    return totalMinutes === 0 ? "Under a minute" : hoursAndMinutes(totalMinutes);
}
