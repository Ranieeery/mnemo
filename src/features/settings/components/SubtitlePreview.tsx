import { useState } from "react";
import type { SubtitleStyle } from "../../../shared/ipc/bindings";
import { ChoiceGroup, Textarea } from "../../../shared/ui";
import { SubtitleLine, VideoThumbnail } from "../../../shared/video";
import { useSampleFrame } from "../queries";

const SAMPLE = "I'll be right back.\nDon't go anywhere.";

type Scene = "split" | "dark" | "bright" | "library";

const sceneNames: Record<Scene, string> = {
    split: "half dark, half bright",
    dark: "dark",
    bright: "bright",
    library: "frame from your library",
};

/**
 * A subtitle line drawn exactly as in the player, over a background the user picks: half dark and half bright by
 * default (to judge edges over both at once), or a real frame from the library. The sample text can be edited.
 */
export function SubtitlePreview({ style }: { style: SubtitleStyle }) {
    const frame = useSampleFrame().data ?? null;
    const [chosenScene, setScene] = useState<Scene>("split");
    const [text, setText] = useState(SAMPLE);
    // The library frame can only be shown when there is one.
    const scene = chosenScene === "library" && frame === null ? "split" : chosenScene;

    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                <span className="text-small font-medium text-text-muted">Background</span>
                <ChoiceGroup
                    label="Preview background"
                    value={scene}
                    options={[
                        { value: "split", label: "Split" },
                        { value: "dark", label: "Dark" },
                        { value: "bright", label: "Bright" },
                        ...(frame === null ? [] : [{ value: "library" as const, label: "From your library" }]),
                    ]}
                    onChange={setScene}
                />
            </div>
            <div
                role="img"
                aria-label={`Subtitle preview over a ${sceneNames[scene]} background`}
                className="@container relative aspect-video w-full overflow-hidden rounded-card border border-border bg-backdrop"
            >
                {scene === "split" && (
                    <div aria-hidden className="absolute inset-y-0 right-0 w-1/2 bg-preview-bright" />
                )}
                {scene === "bright" && <div aria-hidden className="absolute inset-0 bg-preview-bright" />}
                {scene === "library" && frame !== null && (
                    <div aria-hidden className="absolute inset-0">
                        <VideoThumbnail thumbnailPath={frame} className="w-full" />
                    </div>
                )}
                {text.trim() && <SubtitleLine text={text} style={style} />}
            </div>
            <Textarea
                label="Preview text"
                hint="Only for this preview; it is not saved."
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
            />
        </div>
    );
}
