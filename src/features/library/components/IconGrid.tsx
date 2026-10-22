import type { FolderColor } from "../../../shared/ipc/bindings";
import { FolderIcon, useRovingFocus } from "../../../shared/ui";
import { ICON_COLUMNS } from "../lib/iconPicker";
import { IconOption } from "./IconOption";

type IconGridProps = {
    label: string;
    names: readonly string[];
    selected: string | null;
    onSelect: (name: string) => void;
    color: FolderColor | null;
};

/** A titled grid of icons to choose from: one tab stop, arrows move and choose. */
export function IconGrid({ label, names, selected, onSelect, color }: IconGridProps) {
    const { onKeyDown, itemProps } = useRovingFocus({
        count: names.length,
        activeIndex: Math.max(0, selected === null ? 0 : names.indexOf(selected)),
        onMove: (index) => {
            const name = names[index];
            if (name !== undefined) {
                onSelect(name);
            }
        },
        columns: ICON_COLUMNS,
    });

    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-text-muted">{label}</h3>
            <div role="radiogroup" aria-label={label} className="grid grid-cols-8 gap-1" onKeyDown={onKeyDown}>
                {names.map((name, index) => (
                    <IconOption
                        key={name}
                        {...itemProps(index)}
                        name={name}
                        selected={selected === name}
                        onSelect={onSelect}
                        color={color}
                    >
                        <FolderIcon name={name} />
                    </IconOption>
                ))}
            </div>
        </section>
    );
}
