import { describe, expect, it } from "vitest";
import { cueTextAt, parseSubtitles } from ".";
import { parseTimestamp } from "./timestamp";

describe("parseTimestamp", () => {
    it.each([
        ["00:00:01,500", 1.5],
        ["01:02:03.004", 3723.004],
        ["02:03.250", 123.25],
        ["0:00:05.50", 5.5],
        ["10:00:00,000", 36_000],
    ])("parses %s", (value, seconds) => {
        expect(parseTimestamp(value)).toBeCloseTo(seconds, 6);
    });

    it.each(["", "abc", "1:2", "00:00:01"])("rejects %s", (value) => {
        expect(parseTimestamp(value)).toBeNull();
    });
});

describe("parseSubtitles: srt", () => {
    it("parses cues with Windows line endings, multi-line text and markup", () => {
        const content = [
            "﻿1",
            "00:00:01,000 --> 00:00:02,500",
            "<i>Hello</i>",
            "world",
            "",
            "2",
            "00:00:03,000 --> 00:00:04,000",
            "Second",
            "",
        ].join("\r\n");
        expect(parseSubtitles("srt", content)).toEqual([
            { start: 1, end: 2.5, text: "Hello\nworld" },
            { start: 3, end: 4, text: "Second" },
        ]);
    });

    it("skips malformed blocks", () => {
        const content = "1\nnot a timing line\ntext\n\n2\n00:00:05,000 --> 00:00:06,000\nkept\n";
        expect(parseSubtitles("srt", content)).toEqual([{ start: 5, end: 6, text: "kept" }]);
    });
});

describe("parseSubtitles: vtt", () => {
    it("ignores the header and notes, accepts short timestamps and cue settings", () => {
        const content = [
            "WEBVTT - title",
            "",
            "NOTE a comment",
            "",
            "intro",
            "00:01.000 --> 00:02.000 align:start position:10%",
            "<c.yellow>Short</c>",
            "",
            "00:00:03.000 --> 00:00:04.000",
            "Long",
        ].join("\n");
        expect(parseSubtitles("vtt", content)).toEqual([
            { start: 1, end: 2, text: "Short" },
            { start: 3, end: 4, text: "Long" },
        ]);
    });
});

describe("parseSubtitles: sub", () => {
    it("uses the declared frame rate and splits lines on pipes", () => {
        const content = "{1}{1}10\n{20}{40}{y:i}First|line\n{50}{60}Second";
        expect(parseSubtitles("sub", content)).toEqual([
            { start: 2, end: 4, text: "First\nline" },
            { start: 5, end: 6, text: "Second" },
        ]);
    });

    it("defaults to 25 frames per second", () => {
        expect(parseSubtitles("sub", "{25}{50}One")).toEqual([{ start: 1, end: 2, text: "One" }]);
    });
});

describe("parseSubtitles: ass", () => {
    it("reads dialogue fields from the Format line and cleans override tags", () => {
        const content = [
            "[Script Info]",
            "Title: Test",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            "Dialogue: 0,0:00:05.00,0:00:06.50,Default,,0,0,0,,{\\i1}Later{\\i0}, with comma",
            "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,First\\NSecond",
            "Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,ignored",
        ].join("\n");
        expect(parseSubtitles("ass", content)).toEqual([
            { start: 1, end: 2, text: "First\nSecond" },
            { start: 5, end: 6.5, text: "Later, with comma" },
        ]);
    });

    it("ignores dialogue outside the events section", () => {
        expect(parseSubtitles("ass", "[Styles]\nDialogue: 0,0:00:01.00,0:00:02.00,a,,0,0,0,,x")).toEqual([]);
    });
});

describe("cueTextAt", () => {
    const cues = [
        { start: 1, end: 3, text: "a" },
        { start: 2, end: 4, text: "b" },
        { start: 10, end: 12, text: "c" },
    ];

    it.each([
        [0, ""],
        [1, "a"],
        [2.5, "a\nb"],
        [3, "b"],
        [5, ""],
        [11.9, "c"],
        [12, ""],
    ])("at %s shows %j", (time, text) => {
        expect(cueTextAt(cues, time)).toBe(text);
    });

    it("handles an empty list", () => {
        expect(cueTextAt([], 5)).toBe("");
    });
});
