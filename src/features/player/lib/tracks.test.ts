import { describe, expect, it } from "vitest";
import type { AudioTrack, SubtitleTrack } from "../../../shared/ipc/bindings";
import {
    audioTrackLabel,
    defaultSubtitleSource,
    languageName,
    matchAudioTracks,
    sourceFromKey,
    sourceKey,
    subtitleTrackLabel,
} from "./tracks";

function track(overrides: Partial<SubtitleTrack>): SubtitleTrack {
    return {
        index: 0,
        language: null,
        title: null,
        codec: "subrip",
        isDefault: false,
        isForced: false,
        isText: true,
        ...overrides,
    };
}

describe("languageName", () => {
    it("names ISO 639 codes and gives up on unknown ones", () => {
        expect(languageName("eng")).toBe("English");
        expect(languageName("pt")).toBe("Portuguese");
        expect(languageName("jpn")).toBe("Japanese");
        expect(languageName("qaa")).toBeNull();
        expect(languageName("not a tag!")).toBeNull();
        expect(languageName(null)).toBeNull();
    });
});

describe("subtitleTrackLabel", () => {
    it("reads language, title, format and the forced flag", () => {
        expect(subtitleTrackLabel(track({ language: "eng", title: "Signs", codec: "ass", isForced: true }))).toBe(
            "English · Signs · ASS · Forced"
        );
        expect(subtitleTrackLabel(track({ language: "por" }))).toBe("Portuguese · SubRip");
        expect(subtitleTrackLabel(track({ title: "Commentary", codec: "hdmv_pgs_subtitle" }))).toBe("Commentary · PGS");
        expect(subtitleTrackLabel(track({ index: 2, codec: "eia_608" }))).toBe("Track 3 · EIA_608");
        expect(subtitleTrackLabel(track({ language: "qaa" }))).toBe("qaa · SubRip");
    });
});

describe("defaultSubtitleSource", () => {
    const image = track({ index: 0, codec: "hdmv_pgs_subtitle", isText: false, isDefault: true });
    const first = track({ index: 1 });
    const marked = track({ index: 2, isDefault: true });

    it("prefers the file next to the video", () => {
        expect(defaultSubtitleSource(true, [first])).toEqual({ kind: "file" });
    });

    it("then the default text track, then the first text track", () => {
        expect(defaultSubtitleSource(false, [image, first, marked])).toEqual({ kind: "embedded", index: 2 });
        expect(defaultSubtitleSource(false, [image, first])).toEqual({ kind: "embedded", index: 1 });
    });

    it("never picks image subtitles", () => {
        expect(defaultSubtitleSource(false, [image])).toBeNull();
        expect(defaultSubtitleSource(false, [])).toBeNull();
    });
});

describe("source keys", () => {
    it("round-trip", () => {
        for (const source of [{ kind: "file" }, { kind: "embedded", index: 3 }] as const) {
            expect(sourceFromKey(sourceKey(source))).toEqual(source);
        }
        expect(sourceFromKey("off")).toBeNull();
    });
});

function audio(index: number, codec: string, language: string | null = null): AudioTrack {
    return { index, language, title: null, codec, channels: 2, isDefault: index === 0 };
}

describe("audioTrackLabel", () => {
    it("reads language, title, codec and channel layout", () => {
        expect(audioTrackLabel({ ...audio(0, "ac3", "jpn"), title: "Commentary", channels: 6 })).toBe(
            "Japanese · Commentary · AC3 · 5.1"
        );
        expect(audioTrackLabel(audio(1, "aac", "eng"))).toBe("English · AAC · Stereo");
        expect(audioTrackLabel({ ...audio(2, "pcm_s16le"), channels: null })).toBe("Track 3 · PCM");
    });
});

describe("matchAudioTracks", () => {
    const ac3 = audio(0, "ac3", "eng");
    const aac = audio(1, "aac", "jpn");

    it("matches one to one when the player lists every track", () => {
        expect(matchAudioTracks([ac3, aac], ["eng", "jpn"])).toEqual([0, 1]);
        expect(matchAudioTracks([audio(0, "aac"), audio(1, "aac")], ["", ""])).toEqual([0, 1]);
        // Some players report two-letter codes.
        expect(matchAudioTracks([ac3, aac], ["en", "ja"])).toEqual([0, 1]);
    });

    it("leaves out the tracks the player could not decode", () => {
        // WebView2 drops AC3: only the AAC track is listed.
        expect(matchAudioTracks([ac3, aac], ["jpn"])).toEqual([null, 0]);
    });

    it("gives up when the lists cannot be matched safely", () => {
        expect(matchAudioTracks([ac3, aac], ["eng"])).toEqual([null, null]);
        expect(matchAudioTracks([aac, audio(2, "aac", "por")], ["por", "jpn"])).toEqual([null, null]);
        expect(matchAudioTracks([ac3, aac], [])).toEqual([null, null]);
    });
});
