/** jsdom has no layout: tests set the window width that `max-width`/`min-width` media queries are answered against. */
const DEFAULT_WIDTH = 1200;

let width = DEFAULT_WIDTH;
const subscriptions: { query: string; listener: EventListenerOrEventListenerObject }[] = [];

/** Answers `(max-width: Npx)` and `(min-width: Npx)` for the current width; any other query does not match. */
function matches(query: string): boolean {
    const bound = /^\((max|min)-width:\s*([\d.]+)px\)$/.exec(query.trim());
    if (!bound) {
        return false;
    }
    const limit = Number(bound[2]);
    return bound[1] === "max" ? width <= limit : width >= limit;
}

export function installMatchMedia() {
    window.matchMedia = (query: string) => ({
        get matches() {
            return matches(query);
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            subscriptions.push({ query, listener });
        },
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            const index = subscriptions.findIndex((entry) => entry.query === query && entry.listener === listener);
            if (index !== -1) {
                subscriptions.splice(index, 1);
            }
        },
        dispatchEvent: () => false,
    });
}

/** Resizes the window as media queries see it, telling the queries whose answer changed. */
export function setWindowWidth(next: number) {
    const before = subscriptions.map((entry) => matches(entry.query));
    width = next;
    const changed = subscriptions.filter((entry, index) => matches(entry.query) !== before[index]);
    for (const { listener } of changed) {
        const event = new Event("change");
        if (typeof listener === "function") {
            listener(event);
        } else {
            listener.handleEvent(event);
        }
    }
}

export function resetWindowWidth() {
    width = DEFAULT_WIDTH;
}
