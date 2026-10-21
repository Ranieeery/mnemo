/**
 * Runs `run` with the latest scheduled value once `delayMs` pass without another one, so a burst of changes (a
 * dragged slider or edge) is handled once. `flush` runs what is still waiting right away, e.g. on unmount, and
 * `cancel` drops it.
 */
export function debounce<T>(run: (value: T) => void, delayMs: number) {
    let pending: { value: T } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
        clearTimeout(timer);
        if (pending) {
            const { value } = pending;
            pending = null;
            run(value);
        }
    };

    return {
        schedule(value: T) {
            pending = { value };
            clearTimeout(timer);
            timer = setTimeout(flush, delayMs);
        },
        flush,
        cancel() {
            clearTimeout(timer);
            pending = null;
        },
    };
}
