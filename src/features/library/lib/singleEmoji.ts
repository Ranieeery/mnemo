const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Returns the trimmed value when it is exactly one emoji (one grapheme, so flags and skin tones count as one),
 * otherwise `null`.
 */
export function singleEmoji(value: string): string | null {
    const trimmed = value.trim();
    const graphemes = [...segmenter.segment(trimmed)];
    if (graphemes.length !== 1) {
        return null;
    }
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(trimmed) ? trimmed : null;
}
