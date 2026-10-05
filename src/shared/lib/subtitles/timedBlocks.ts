import { parseTimestamp } from "./timestamp";
import type { Cue } from "./types";

const TIMING = /^\s*(\S+)\s*-->\s*(\S+)/;

/**
 * Parses SubRip and WebVTT, which share the cue layout: an optional identifier, a `start --> end` line (WebVTT may
 * add cue settings after it) and the text until a blank line. WebVTT headers, NOTE and STYLE blocks have no timing
 * line and are skipped.
 */
export function parseTimedBlocks(content: string): Cue[] {
    const cues: Cue[] = [];
    const blocks = content
        .replace(/^﻿/, "")
        .replace(/\r\n?/g, "\n")
        .split(/\n[ \t]*\n/);
    for (const block of blocks) {
        const lines = block.split("\n");
        const timingIndex = lines.findIndex((line) => line.includes("-->"));
        const timing = timingIndex === -1 ? null : TIMING.exec(lines[timingIndex] ?? "");
        if (!timing) {
            continue;
        }
        const start = parseTimestamp(timing[1] ?? "");
        const end = parseTimestamp(timing[2] ?? "");
        const text = lines
            .slice(timingIndex + 1)
            .join("\n")
            .trim();
        if (start !== null && end !== null && text) {
            cues.push({ start, end, text: stripMarkup(text) });
        }
    }
    return cues;
}

/** Removes the HTML-like tags both formats allow (`<i>`, `<b>`, `<c.yellow>`, `<00:01.000>`). */
function stripMarkup(text: string): string {
    return text.replace(/<[^>]*>/g, "");
}
