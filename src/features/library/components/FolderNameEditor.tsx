import { type KeyboardEvent, type ReactElement, useEffect, useRef } from "react";
import { type LibraryFolder, MAX_FOLDER_NAME_CHARS } from "../../../shared/ipc/bindings";
import { FolderIcon, Input, Popover, PopoverAnchor, PopoverContent } from "../../../shared/ui";

/**
 * Ends an edit: `name` is the value to save, or `null` to cancel. `restoreFocus` returns the focus to the folder
 * (after `Enter` or `Esc`); a click elsewhere leaves it where the user clicked.
 */
export type FolderNameDone = (name: string | null, restoreFocus: boolean) => void;

type FolderNameFieldProps = {
    folder: LibraryFolder;
    onDone: FolderNameDone;
    /** The folder on disk, in the popover; the inline field has no room for it (its placeholder says it). */
    hint?: string;
    /** Saves when the field loses the focus (inline). The popover saves on a click outside instead. */
    saveOnBlur: boolean;
};

/** The name field: starts with the current name selected; `Enter` saves and `Esc` cancels. */
function FolderNameField({ folder, onDone, hint, saveOnBlur }: FolderNameFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    // `Enter` removes the field, which could also blur it: the edit ends once.
    const done = useRef(false);
    const finish = (name: string | null, restoreFocus: boolean) => {
        if (!done.current) {
            done.current = true;
            onDone(name, restoreFocus);
        }
    };

    // Focused after mounting, so it wins over a closing context menu giving the focus back.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish(event.currentTarget.value, true);
        } else if (event.key === "Escape") {
            // Only the edit ends: nothing else (a full screen player, the search) reacts to this `Esc`.
            event.preventDefault();
            event.stopPropagation();
            finish(null, true);
        }
    };

    return (
        <Input
            ref={inputRef}
            label="Folder name"
            hideLabel={hint === undefined}
            hint={hint}
            className="min-w-0 flex-1"
            defaultValue={folder.name}
            placeholder={folder.folderName}
            maxLength={MAX_FOLDER_NAME_CHARS}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={handleKeyDown}
            onBlur={saveOnBlur ? (event) => finish(event.currentTarget.value, false) : undefined}
        />
    );
}

/** Takes the place of the folder in the expanded sidebar while it is renamed. */
export function InlineFolderNameEditor({ folder, onDone }: { folder: LibraryFolder; onDone: FolderNameDone }) {
    return (
        <div className="flex min-h-9 items-center gap-2.5 pl-2.5">
            <FolderIcon name={folder.customIcon} color={folder.iconColor} />
            <FolderNameField folder={folder} onDone={onDone} saveOnBlur />
        </div>
    );
}

type RenameFolderPopoverProps = {
    folder: LibraryFolder;
    open: boolean;
    onDone: FolderNameDone;
    /** The folder icon in the rail, which the popover opens next to. */
    children: ReactElement;
};

/** Renames a folder of the collapsed sidebar, where there is no room for the name: a click outside saves. */
export function RenameFolderPopover({ folder, open, onDone, children }: RenameFolderPopoverProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const currentValue = () => contentRef.current?.querySelector("input")?.value ?? null;
    return (
        <Popover open={open}>
            <PopoverAnchor asChild>{children}</PopoverAnchor>
            <PopoverContent
                ref={contentRef}
                side="right"
                align="start"
                className="w-64"
                aria-label={`Rename ${folder.name}`}
                // The field focuses itself; the folder gets the focus back from `onDone` when it should.
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={() => onDone(currentValue(), false)}
            >
                <FolderNameField
                    folder={folder}
                    onDone={onDone}
                    hint={`Folder on disk: ${folder.folderName}. Leave empty to use it.`}
                    saveOnBlur={false}
                />
            </PopoverContent>
        </Popover>
    );
}
