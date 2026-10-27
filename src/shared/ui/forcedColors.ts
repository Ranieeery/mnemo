/*
 * Windows high contrast (`forced-colors`) paints every background with the window color, so a bar, track or knob
 * drawn only with a fill disappears. These classes opt such fills out of the forcing and draw them in the system
 * colors the user chose instead; outside that mode they do nothing. System color keywords are the only way to follow
 * the user's contrast theme, so they are used here rather than tokens.
 */

/** The empty part of a bar or a switch: the window color inside a text-colored outline. */
export const forcedTrackClasses =
    "forced-colors:forced-color-adjust-none forced-colors:bg-[Canvas] forced-colors:outline forced-colors:outline-1 forced-colors:outline-[CanvasText]";

/** The filled part of a bar (progress, the slider's range): the highlight color. */
export const forcedFillClasses = "forced-colors:forced-color-adjust-none forced-colors:bg-[Highlight]";

/** A knob over a track (a slider's thumb, a switch's thumb): the text color. */
export const forcedKnobClasses = "forced-colors:forced-color-adjust-none forced-colors:bg-[CanvasText]";
