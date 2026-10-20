import type { ReactElement } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { FolderIcon } from "../../../shared/ui";
import { type NameDone, NameField, NamePopover } from "./NameField";

/** Takes the place of the folder in the expanded sidebar while it is renamed. */
export function InlineFolderNameEditor({ folder, onDone }: { folder: LibraryFolder; onDone: NameDone }) {
    return (
        <div className="flex min-h-9 items-center gap-2.5 pl-2.5">
            <FolderIcon name={folder.customIcon} color={folder.iconColor} />
            <NameField
                label="Folder name"
                initialValue={folder.name}
                placeholder={folder.folderName}
                saveOnBlur
                onDone={onDone}
            />
        </div>
    );
}

type RenameFolderPopoverProps = {
    folder: LibraryFolder;
    open: boolean;
    onDone: NameDone;
    /** The folder icon in the rail, which the popover opens next to. */
    children: ReactElement;
};

/** Renames a folder of the collapsed sidebar, where there is no room for the name. */
export function RenameFolderPopover({ folder, open, onDone, children }: RenameFolderPopoverProps) {
    return (
        <NamePopover
            open={open}
            title={`Rename ${folder.name}`}
            label="Folder name"
            initialValue={folder.name}
            placeholder={folder.folderName}
            hint={`Folder on disk: ${folder.folderName}. Leave empty to use it.`}
            onDone={onDone}
        >
            {children}
        </NamePopover>
    );
}
