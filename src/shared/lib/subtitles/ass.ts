import { parseTimestamp } from "./timestamp";
import type { Cue } from "./types";

const DEFAULT_FIELDS = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];

/**
 * Parses the dialogue lines of SubStation Alpha / Advanced SubStation (`.ass`). Field positions come from the
 * `Format:` line of the `[Events]` section; override tags (`{\i1}`) are removed and `\N` becomes a line break.
 */
export function parseAss(content: string): Cue[] {
    const cues: Cue[] = [];
    let inEvents = false;
    let fields = DEFAULT_FIELDS;
    for (const rawLine of content.replace(/^﻿/, "").split(/\r\n?|\n/)) {
        const line = rawLine.trim();
        if (line.startsWith("[")) {
            inEvents = line.toLowerCase() === "[events]";
            continue;
        }
        if (!inEvents) {
            continue;
        }
        if (line.toLowerCase().startsWith("format:")) {
            fields = line
                .slice("format:".length)
                .split(",")
                .map((field) => field.trim().toLowerCase());
            continue;
        }
        if (!line.toLowerCase().startsWith("dialogue:")) {
            continue;
        }
        const cue = parseDialogue(line.slice("dialogue:".length), fields);
        if (cue) {
            cues.push(cue);
        }
    }
    return cues.sort((a, b) => a.start - b.start);
}

function parseDialogue(body: string, fields: string[]): Cue | null {
    // The text is the last field and may itself contain commas.
    const values = body.split(",");
    const textIndex = fields.indexOf("text");
    if (textIndex === -1 || values.length < fields.length) {
        return null;
    }
    const start = parseTimestamp(values[fields.indexOf("start")] ?? "");
    const end = parseTimestamp(values[fields.indexOf("end")] ?? "");
    const text = values
        .slice(textIndex)
        .join(",")
        .replace(/\{[^}]*\}/g, "")
        .replace(/\\[Nn]/g, "\n")
        .replace(/\\h/g, " ")
        .trim();
    if (start === null || end === null || !text) {
        return null;
    }
    return { start, end, text };
}
