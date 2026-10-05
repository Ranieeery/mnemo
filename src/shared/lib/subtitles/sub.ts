import type { Cue } from "./types";

const LINE = /^\{(\d+)\}\{(\d+)\}(.*)$/;
const DEFAULT_FRAME_RATE = 25;

/**
 * Parses MicroDVD (`{startFrame}{endFrame}text`, `|` separates lines). Frames are converted with the rate given by
 * the conventional `{1}{1}23.976` first line, or 25 fps when the file does not declare one.
 */
export function parseMicroDvd(content: string): Cue[] {
    const cues: Cue[] = [];
    let frameRate = DEFAULT_FRAME_RATE;
    const lines = content.replace(/^﻿/, "").split(/\r\n?|\n/);
    for (const [index, line] of lines.entries()) {
        const match = LINE.exec(line.trim());
        if (!match) {
            continue;
        }
        const [, startFrame = "0", endFrame = "0", rawText = ""] = match;
        const declaredRate = Number(rawText);
        if (index === 0 && startFrame === endFrame && declaredRate > 0) {
            frameRate = declaredRate;
            continue;
        }
        const text = rawText
            .replace(/\{[^}]*\}/g, "")
            .split("|")
            .join("\n")
            .trim();
        if (text) {
            cues.push({ start: Number(startFrame) / frameRate, end: Number(endFrame) / frameRate, text });
        }
    }
    return cues;
}
