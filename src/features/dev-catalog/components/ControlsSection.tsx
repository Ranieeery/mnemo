import { FolderPlus, Maximize, Pause, Play, Subtitles, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Input, SearchInput, Slider, Switch } from "../../../shared/ui";
import { CatalogSection, Specimen } from "./CatalogSection";

export function ControlsSection() {
    const [query, setQuery] = useState("finale");
    const [volume, setVolume] = useState(70);
    const [threshold, setThreshold] = useState(90);
    const [subtitles, setSubtitles] = useState(true);
    const [continuous, setContinuous] = useState(false);
    const [playing, setPlaying] = useState(false);

    return (
        <CatalogSection id="controls" title="Controls" description="Buttons, fields and inputs with their states.">
            <Specimen label="Button variants">
                <Button variant="primary" icon={<FolderPlus />}>
                    Add folder
                </Button>
                <Button>Export library</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger" icon={<Trash2 />}>
                    Remove folder
                </Button>
            </Specimen>
            <Specimen label="Button sizes and states">
                <Button size="sm">Small</Button>
                <Button variant="primary" loading>
                    Importing
                </Button>
                <Button disabled>Disabled</Button>
            </Specimen>
            <Specimen label="Icon buttons (hover or focus for the tooltip)">
                <IconButton
                    label={playing ? "Pause" : "Play"}
                    shortcut="K"
                    icon={playing ? <Pause /> : <Play />}
                    onClick={() => setPlaying(!playing)}
                />
                <IconButton label="Mute" shortcut="M" icon={<Volume2 />} variant="secondary" />
                <IconButton
                    label="Subtitles"
                    shortcut="C"
                    icon={<Subtitles />}
                    pressed={subtitles}
                    onClick={() => setSubtitles(!subtitles)}
                />
                <IconButton label="Full screen" shortcut="F" icon={<Maximize />} size="lg" />
                <IconButton label="Unavailable" icon={<Subtitles />} disabled />
            </Specimen>

            <div className="grid max-w-3xl gap-6 md:grid-cols-2">
                <Input label="Title" defaultValue="Pilot" />
                <Input label="Tag" placeholder="anime" hint="Tags are saved in lowercase." />
                <Input label="Title" defaultValue="" error="The title cannot be empty." />
                <Input label="Disabled" defaultValue="Read only" disabled />
            </div>

            <div className="grid max-w-3xl gap-6 md:grid-cols-2">
                <Specimen label="Search with a value">
                    <SearchInput label="Search" value={query} onValueChange={setQuery} placeholder="Search videos" />
                </Specimen>
                <Specimen label="Search while loading">
                    <SearchInput label="Search loading" value="ep 1" onValueChange={() => {}} busy />
                </Specimen>
            </div>

            <div className="grid max-w-3xl gap-6 md:grid-cols-2">
                <Specimen label={`Slider: volume ${volume}%`}>
                    <Slider
                        label="Volume"
                        value={volume}
                        onValueChange={setVolume}
                        valueText={`${volume}%`}
                        className="w-full"
                    />
                </Specimen>
                <Specimen label={`Slider with steps: ${threshold}%`}>
                    <Slider
                        label="Watched threshold"
                        value={threshold}
                        onValueChange={setThreshold}
                        min={50}
                        max={100}
                        step={5}
                        valueText={`${threshold}%`}
                        className="w-full"
                    />
                </Specimen>
            </div>

            <div className="flex max-w-md flex-col gap-4">
                <Switch
                    label="Continuous view"
                    description="Show every video below this folder, grouped by subfolder."
                    checked={continuous}
                    onCheckedChange={setContinuous}
                />
                <Switch label="Disabled" checked={false} onCheckedChange={() => {}} disabled />
            </div>
        </CatalogSection>
    );
}
