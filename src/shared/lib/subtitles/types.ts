/** A subtitle line shown between `start` and `end` (seconds). Multi-line cues keep their `\n`. */
export type Cue = {
    start: number;
    end: number;
    text: string;
};
