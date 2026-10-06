import { useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { Button, Dialog, FOLDER_ICONS, FolderIcon, type FolderIconName, isFolderIconName } from "../../../shared/ui";
import { useSetFolderIcon } from "../queries";

type ChangeIconDialogProps = {
    folder: LibraryFolder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const iconNames = Object.keys(FOLDER_ICONS).filter(isFolderIconName);

export function ChangeIconDialog({ folder, open, onOpenChange }: ChangeIconDialogProps) {
    const setIcon = useSetFolderIcon();
    const [selected, setSelected] = useState<FolderIconName | null>(
        isFolderIconName(folder.customIcon) ? folder.customIcon : null
    );

    const save = (icon: FolderIconName | null) => {
        setIcon.mutate({ folder, icon }, { onSuccess: () => onOpenChange(false) });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Icon for ${folder.name}`}
            description="Shown next to the folder in the sidebar and on the home page."
            footer={
                <>
                    <Button variant="ghost" onClick={() => save(null)} disabled={setIcon.isPending}>
                        Use default icon
                    </Button>
                    <Button variant="primary" loading={setIcon.isPending} onClick={() => save(selected)}>
                        Save icon
                    </Button>
                </>
            }
        >
            <div role="radiogroup" aria-label="Icons" className="grid grid-cols-8 gap-1 pb-2">
                {iconNames.map((name) => (
                    // biome-ignore lint/a11y/useSemanticElements: a grid of icon buttons reads better than radio inputs.
                    <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={selected === name}
                        aria-label={name.replace(/-\d+$/, "").replace(/-/g, " ")}
                        onClick={() => setSelected(name)}
                        className={cx(
                            "flex aspect-square items-center justify-center rounded-control text-text-muted",
                            "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover hover:text-text",
                            selected === name && "bg-surface-hover text-text ring-2 ring-accent"
                        )}
                    >
                        <FolderIcon name={name} className="size-5" />
                    </button>
                ))}
            </div>
        </Dialog>
    );
}
