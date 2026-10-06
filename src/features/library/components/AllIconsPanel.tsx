import { use, useMemo, useState } from "react";
import { loadAllIcons, ScrollContainer, SearchInput, VirtualList } from "../../../shared/ui";
import { filterIconNames } from "../lib/iconPicker";
import { IconOption } from "./IconOption";

const COLUMNS = 8;

type AllIconsPanelProps = {
    selected: string | null;
    onSelect: (name: string) => void;
};

/** Every lucide icon with a search field. Suspends until the icon set is loaded. */
export function AllIconsPanel({ selected, onSelect }: AllIconsPanelProps) {
    const icons = use(loadAllIcons());
    const [query, setQuery] = useState("");
    const names = useMemo(() => [...icons.keys()], [icons]);
    const matches = filterIconNames(names, query);
    const rows = useMemo(() => chunk(matches, COLUMNS), [matches]);

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
                <div role="radiogroup" aria-label="All icons">
                    {/* Room for the selection ring and focus outline of the icons at the edges, which scrolling would clip. */}
                    <ScrollContainer className="h-72 p-1">
                        <VirtualList
                            items={rows}
                            getKey={(row) => row[0] ?? ""}
                            estimateSize={() => 52}
                            renderItem={(row) => (
                                <div className="grid grid-cols-8 gap-1 pb-1">
                                    {row.map((name) => {
                                        const Icon = icons.get(name);
                                        return (
                                            <IconOption
                                                key={name}
                                                name={name}
                                                selected={selected === name}
                                                onSelect={onSelect}
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

function chunk<T>(items: readonly T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        rows.push(items.slice(start, start + size));
    }
    return rows;
}
