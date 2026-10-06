import type { AudioTrack, SubtitleTrack } from "../../../shared/ipc/bindings";

/** Where the shown subtitles come from: the file next to the video, or a track inside it. */
export type SubtitleSource = { kind: "file" } | { kind: "embedded"; index: number };

/** A stable string for a source, used as the value of the subtitles menu. */
export function sourceKey(source: SubtitleSource): string {
    return source.kind === "file" ? "file" : `embedded-${source.index}`;
}

export function sourceFromKey(key: string): SubtitleSource | null {
    if (key === "file") {
        return { kind: "file" };
    }
    const match = /^embedded-(\d+)$/.exec(key);
    return match ? { kind: "embedded", index: Number(match[1]) } : null;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

/** "English" for "eng" or "en"; `null` for codes it does not know, so the caller can fall back. */
export function languageName(code: string | null): string | null {
    if (!code) {
        return null;
    }
    try {
        return languageNames.of(code) ?? null;
    } catch {
        // Not a valid language tag at all.
        return null;
    }
}

const codecNames: Record<string, string> = {
    subrip: "SubRip",
    srt: "SubRip",
    ass: "ASS",
    ssa: "SSA",
    webvtt: "WebVTT",
    mov_text: "Text",
    text: "Text",
    microdvd: "MicroDVD",
    hdmv_pgs_subtitle: "PGS",
    dvd_subtitle: "VobSub",
    dvb_subtitle: "DVB",
};

/** "English · Signs · ASS · Forced": language (or the raw code), title, format and the forced flag. */
export function subtitleTrackLabel(track: SubtitleTrack): string {
    const language = languageName(track.language) ?? track.language;
    return [
        language ?? track.title ?? `Track ${track.index + 1}`,
        language ? track.title : null,
        codecNames[track.codec] ?? track.codec.toUpperCase(),
        track.isForced ? "Forced" : null,
    ]
        .filter((part) => part)
        .join(" · ");
}

/**
 * What plays when the user has not chosen: the file next to the video, then the embedded track the file marks as
 * default, then its first text track. Image tracks are never picked.
 */
export function defaultSubtitleSource(hasFile: boolean, tracks: readonly SubtitleTrack[]): SubtitleSource | null {
    if (hasFile) {
        return { kind: "file" };
    }
    const text = tracks.filter((track) => track.isText);
    const chosen = text.find((track) => track.isDefault) ?? text[0];
    return chosen ? { kind: "embedded", index: chosen.index } : null;
}

const audioCodecNames: Record<string, string> = {
    aac: "AAC",
    ac3: "AC3",
    eac3: "E-AC3",
    dts: "DTS",
    truehd: "TrueHD",
    mp3: "MP3",
    opus: "Opus",
    vorbis: "Vorbis",
    flac: "FLAC",
};

function channelLayout(channels: number | null): string | null {
    switch (channels) {
        case null:
            return null;
        case 1:
            return "Mono";
        case 2:
            return "Stereo";
        case 6:
            return "5.1";
        case 8:
            return "7.1";
        default:
            return `${channels} channels`;
    }
}

/** "AC3", "E-AC3", "PCM"... */
export function audioCodecName(codec: string): string {
    return audioCodecNames[codec] ?? (codec.startsWith("pcm") ? "PCM" : codec.toUpperCase());
}

/** "Japanese · Commentary · AC3 · 5.1". */
export function audioTrackLabel(track: AudioTrack): string {
    const language = languageName(track.language) ?? track.language;
    const codec = audioCodecName(track.codec);
    return [
        language ?? track.title ?? `Track ${track.index + 1}`,
        language ? track.title : null,
        codec,
        channelLayout(track.channels),
    ]
        .filter((part) => part)
        .join(" · ");
}

/** Codecs every webview decodes. Others (AC3, DTS...) depend on the platform and may be left out of the player. */
function isWidelySupported(codec: string): boolean {
    return ["aac", "mp3", "opus", "vorbis", "flac"].includes(codec) || codec.startsWith("pcm");
}

/** "eng" (ffprobe, ISO 639-2) and "en" (BCP 47, as some players report it) are the same language. */
function sameLanguage(first: string, second: string): boolean {
    const name = languageName(first);
    return first === second || (name !== null && name === languageName(second));
}

/** "E-AC3" or "AC3 and DTS": the distinct formats of some tracks, for messages. */
export function audioFormatsOf(tracks: readonly AudioTrack[]): string {
    const names = [...new Set(tracks.map((track) => audioCodecName(track.codec)))];
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/**
 * Pairs the file's audio tracks (ffprobe) with the ones the player exposes (`audioTracks`): the position in the
 * player for each file track, or `null` when the player left it out because it cannot decode it. When the player
 * lists every track they match one to one; otherwise it lists the widely supported ones, in order. Anything else
 * (or languages that disagree) cannot be matched safely, and every track gets `null`.
 */
export function matchAudioTracks(tracks: readonly AudioTrack[], playerLanguages: readonly string[]): (number | null)[] {
    const candidates =
        playerLanguages.length === tracks.length ? tracks : tracks.filter((track) => isWidelySupported(track.codec));
    const languagesAgree =
        candidates.length === playerLanguages.length &&
        candidates.every((track, position) => {
            const language = playerLanguages[position];
            return !track.language || !language || sameLanguage(track.language, language);
        });
    if (!languagesAgree) {
        return tracks.map(() => null);
    }
    return tracks.map((track) => {
        const position = candidates.indexOf(track);
        return position === -1 ? null : position;
    });
}
