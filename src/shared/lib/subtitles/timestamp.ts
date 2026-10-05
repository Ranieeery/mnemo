const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;

/**
 * Parses `hh:mm:ss,mmm`, `hh:mm:ss.mmm`, `mm:ss.mmm` (WebVTT allows omitting hours) and `h:mm:ss.cc` (ASS uses
 * centiseconds) into seconds. Returns `null` for anything else.
 */
export function parseTimestamp(value: string): number | null {
    const match = TIMESTAMP.exec(value.trim());
    if (!match) {
        return null;
    }
    const [, hours = "0", minutes = "0", seconds = "0", fraction = "0"] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction) / 10 ** fraction.length;
}
