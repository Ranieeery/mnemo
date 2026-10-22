import { use, useMemo, useState } from "react";
import type { FolderColor } from "../../../shared/ipc/bindings";
import { chunk } from "../../../shared/lib/chunk";
import { loadAllIcons, ScrollContainer, SearchInput, useRovingFocus, VirtualList } from "../../../shared/ui";
import { filterIconNames, ICON_COLUMNS } from "../lib/iconPicker";
import { IconOption } from "./IconOption";

type AllIconsPanelProps = {
    selected: string | null;
    onSelect: (name: string) => void;
    /** The color being chosen, previewed on every icon. */
    color: FolderColor | null;
};

/** Every lucide icon with a search field. Suspends until the icon set is loaded. */
export function AllIconsPanel({ selected, onSelect, color }: AllIconsPanelProps) {
    const icons = use(loadAllIcons());
    const [query, setQuery] = useState("");
    const names = useMemo(() => [...icons.keys()], [icons]);
    const filtered = useMemo(() => filterIconNames(names, query), [names, query]);
    const rows = useMemo(() => chunk([...filtered.entries()], ICON_COLUMNS), [filtered]);
    const activeIndex = Math.max(0, selected === null ? 0 : filtered.indexOf(selected));
    const { onKeyDown, itemProps } = useRovingFocus({
        count: filtered.length,
        activeIndex,
        onMove: (index) => {
            const name = filtered[index];
            if (name !== undefined) {
                onSelect(name);
            }
        },
        columns: ICON_COLUMNS,
    });

    return (
        <div className="flex flex-col gap-3">
            <SearchInput
                label="Search icons"
                placeholder={`Search ${names.length} icons`}
                value={query}
                onValueChange={setQuery}
            />
            {rows.length === 0 ? (
                <p className="flex h-72 items-center justify-center px-6 text-center text-small text-text-muted">
                    No icon is called “{query.trim()}”. Icons have English names; try a simpler word, like “game”.
                </p>
            ) : (
                <div role="radiogroup" aria-label="All icons" onKeyDown={onKeyDown}>
                    {/* Room for the selection ring and focus outline of the icons at the edges, which scrolling would clip. */}
                    <ScrollContainer className="h-72 p-1">
                        <VirtualList
                            items={rows}
                            getKey={(row) => row[0]?.[1] ?? ""}
                            estimateSize={() => 52}
                            // The row with the tab stop stays rendered, so `Tab` reaches the grid from anywhere.
                            keepMounted={Math.floor(activeIndex / ICON_COLUMNS)}
                            renderItem={(row) => (
                                <div className="grid grid-cols-8 gap-1 pb-1">
                                    {row.map(([index, name]) => {
                                        const Icon = icons.get(name);
                                        return (
                                            <IconOption
                                                key={name}
                                                {...itemProps(index)}
                                                name={name}
                                                selected={selected === name}
                                                onSelect={onSelect}
                                                color={color}
                                            >
                                                {Icon && <Icon aria-hidden />}
                                            </IconOption>
                                        );
                                    })}
                                </div>
                            )}
                        />
                    </ScrollContainer>
                </div>
            )}
        </div>
    );
}
