/** At most this many icons on the picker's first tab, so it stays quick to scan. */
export const MAIN_TAB_LIMIT = 40;

/** The first tab: recently used icons, then suggestions they do not repeat, `MAIN_TAB_LIMIT` in all. */
export function mainTabIcons(recent: readonly string[], suggested: readonly string[]) {
    const shownRecent = recent.slice(0, MAIN_TAB_LIMIT);
    return {
        recent: shownRecent,
        suggested: suggested
            .filter((name) => !shownRecent.includes(name))
            .slice(0, MAIN_TAB_LIMIT - shownRecent.length),
    };
}

const searchable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Icon names containing the query, ignoring case, spaces and hyphens ("gamepad 2" finds "gamepad-2"). */
export function filterIconNames(names: readonly string[], query: string): readonly string[] {
    const needle = searchable(query);
    return needle ? names.filter((name) => searchable(name).includes(needle)) : names;
}

/** How an icon is announced: its name in words. */
export function iconLabel(name: string): string {
    return name.replace(/-/g, " ");
}
