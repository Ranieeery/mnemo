import { RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
    DEFAULT_SUBTITLE_STYLE,
    MAX_SUBTITLE_POSITION,
    MAX_SUBTITLE_SIZE,
    MIN_SUBTITLE_SIZE,
    SUBTITLE_SIZE_STEP,
    type SubtitleColor,
    type SubtitleStyle,
} from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { useSubtitleStyleQuery } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { SUBTITLE_COLORS } from "../../../shared/lib/subtitleStyle";
import { Button, Card, ChoiceGroup, ErrorState, Skeleton, Slider, Switch } from "../../../shared/ui";
import { useSaveSubtitleStyle } from "../queries";
import { SettingRow } from "./SettingRow";
import { SubtitlePreview } from "./SubtitlePreview";

const colorName = (color: SubtitleColor) => color.charAt(0).toUpperCase() + color.slice(1);

/** How subtitles look in the player, with a preview over a dark and a bright scene. Changes save at once. */
export function SubtitleStyleSection() {
    const query = useSubtitleStyleQuery();
    const save = useSaveSubtitleStyle();
    // Sliders move the preview while dragging and save when released.
    const [draft, setDraft] = useState<SubtitleStyle | null>(null);

    useEffect(() => {
        if (!save.isPending) {
            setDraft(null);
        }
    }, [save.isPending]);

    if (query.isPending) {
        return <Skeleton className="aspect-video w-full max-w-xl" />;
    }
    if (query.isError) {
        return (
            <ErrorState
                title="Could not load the subtitle style"
                message={errorMessage(query.error)}
                onRetry={() => query.refetch()}
            />
        );
    }

    const style = draft ?? query.data;
    const change = (next: Partial<SubtitleStyle>) => save.mutate({ ...style, ...next });
    const preview = (next: Partial<SubtitleStyle>) => setDraft({ ...style, ...next });

    return (
        <div className="flex flex-col gap-3">
            <SubtitlePreview style={style} />
            <div className="flex justify-end">
                <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw />}
                    onClick={() => save.mutate({ ...DEFAULT_SUBTITLE_STYLE })}
                >
                    Restore default style
                </Button>
            </div>
            <Card className="divide-y divide-border">
                <SettingRow title="Size" description="Relative to the video, so subtitles grow in full screen.">
                    <SliderValue
                        label="Subtitle size"
                        value={style.size}
                        min={MIN_SUBTITLE_SIZE}
                        max={MAX_SUBTITLE_SIZE}
                        step={SUBTITLE_SIZE_STEP}
                        onChange={(size) => preview({ size })}
                        onCommit={(size) => change({ size })}
                    />
                </SettingRow>
                <SettingRow title="Text color" description="Light colors stay readable over most scenes.">
                    <div role="radiogroup" aria-label="Text color" className="flex gap-2">
                        {SUBTITLE_COLORS.map((value) => (
                            // biome-ignore lint/a11y/useSemanticElements: color swatches read better as buttons than radio inputs.
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={style.color === value}
                                aria-label={colorName(value)}
                                title={colorName(value)}
                                onClick={() => change({ color: value })}
                                className={cx(
                                    "size-7 rounded-full border border-border-strong transition-shadow duration-(--duration-fast) ease-standard",
                                    style.color === value && "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                                )}
                                style={{ backgroundColor: `var(--color-subtitle-${value})` }}
                            />
                        ))}
                    </div>
                </SettingRow>
                <div className="px-5 py-4">
                    <Switch
                        label="Background"
                        description="A dark box behind the text. Without it, use an edge to keep the text readable."
                        checked={style.background}
                        onCheckedChange={(background) => change({ background })}
                    />
                </div>
                <SettingRow title="Background opacity" description="How much of the video shows through the box.">
                    <SliderValue
                        label="Background opacity"
                        value={style.backgroundOpacity}
                        min={0}
                        max={100}
                        step={5}
                        disabled={!style.background}
                        onChange={(backgroundOpacity) => preview({ backgroundOpacity })}
                        onCommit={(backgroundOpacity) => change({ backgroundOpacity })}
                    />
                </SettingRow>
                <SettingRow title="Text edge" description="A shadow or outline around the letters.">
                    <ChoiceGroup
                        label="Text edge"
                        value={style.edge}
                        options={[
                            { value: "none", label: "None" },
                            { value: "shadow", label: "Shadow" },
                            { value: "outline", label: "Outline" },
                        ]}
                        onChange={(edge) => change({ edge })}
                    />
                </SettingRow>
                <SettingRow title="Position" description="Distance from the bottom of the video.">
                    <SliderValue
                        label="Subtitle position"
                        value={style.position}
                        min={0}
                        max={MAX_SUBTITLE_POSITION}
                        step={1}
                        onChange={(position) => preview({ position })}
                        onCommit={(position) => change({ position })}
                    />
                </SettingRow>
                <SettingRow title="Font" description="Fonts from your system, besides the app's own.">
                    <ChoiceGroup
                        label="Font"
                        value={style.font}
                        options={[
                            { value: "app", label: "App", style: { fontFamily: "var(--font-sans)" } },
                            { value: "sans", label: "System", style: { fontFamily: "var(--font-system)" } },
                            { value: "serif", label: "Serif", style: { fontFamily: "var(--font-serif)" } },
                            { value: "mono", label: "Mono", style: { fontFamily: "var(--font-mono)" } },
                        ]}
                        onChange={(font) => change({ font })}
                    />
                </SettingRow>
            </Card>
        </div>
    );
}

type SliderValueProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onChange: (value: number) => void;
    onCommit: (value: number) => void;
};

/** A percentage slider with its value written next to it. */
function SliderValue({ label, value, disabled, onChange, onCommit, ...range }: SliderValueProps): ReactNode {
    return (
        <>
            <Slider
                label={label}
                value={value}
                {...range}
                disabled={disabled}
                valueText={`${value}%`}
                onValueChange={onChange}
                onValueCommit={onCommit}
                className="w-48"
            />
            <span
                className={cx(
                    "w-12 text-right text-body font-medium tabular-nums",
                    disabled ? "text-text-subtle" : "text-text"
                )}
            >
                {value}%
            </span>
        </>
    );
}
