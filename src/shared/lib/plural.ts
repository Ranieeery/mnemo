/** A count with its noun: `plural(1, "video")` is "1 video", `plural(3, "video")` is "3 videos". */
export function plural(count: number, noun: string): string {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
