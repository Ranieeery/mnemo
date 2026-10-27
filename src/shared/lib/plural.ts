/** The noun for a count, without the count: `pluralNoun(1, "video")` is "video", `pluralNoun(3, "video")` "videos". */
export function pluralNoun(count: number, noun: string): string {
    return count === 1 ? noun : `${noun}s`;
}

/** A count with its noun: `plural(1, "video")` is "1 video", `plural(3, "video")` is "3 videos". */
export function plural(count: number, noun: string): string {
    return `${count} ${pluralNoun(count, noun)}`;
}
