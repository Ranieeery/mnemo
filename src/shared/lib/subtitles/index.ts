import type { SubtitleFormat } from "../../ipc/bindings";
import { parseAss } from "./ass";
import { parseMicroDvd } from "./sub";
import { parseTimedBlocks } from "./timedBlocks";
import type { Cue } from "./types";

export type { Cue } from "./types";

/** Parses an external subtitle file into cues sorted by start time. */
export function parseSubtitles(format: SubtitleFormat, content: string): Cue[] {
    switch (format) {
        case "srt":
        case "vtt":
            return parseTimedBlocks(content).sort((a, b) => a.start - b.start);
        case "sub":
            return parseMicroDvd(content);
        case "ass":
            return parseAss(content);
    }
}

/**
 * Text visible at `time`: every cue active at that moment, joined by line breaks (formats allow overlaps).
 * `cues` must be sorted by start time.
 */
export function cueTextAt(cues: readonly Cue[], time: number): string {
    // Binary search for the first cue that starts after `time`; active cues can only be before it.
    let low = 0;
    let high = cues.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if ((cues[middle]?.start ?? 0) <= time) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    const active: string[] = [];
    for (let index = low - 1; index >= 0; index--) {
        const cue = cues[index];
        if (cue && cue.end > time) {
            active.unshift(cue.text);
        }
    }
    return active.join("\n");
}
