/**
 * Where the pointer is over the seek bar, as a fraction of its width (0 to 1, clamped at the ends), or `null` when
 * the bar has no width yet.
 */
export function pointerFraction(clientX: number, left: number, width: number): number | null {
    if (!(width > 0)) {
        return null;
    }
    return Math.min(1, Math.max(0, (clientX - left) / width));
}
