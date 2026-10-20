import { ChevronRight } from "lucide-react";
import { NameField, NamePopover } from "./NameField";
import { useNewGroup } from "./NewGroupContext";

const DEFAULT_NAME = "New group";

/**
 * Names a group about to be created, at the end of the folder list (in a popover from the rail). `Enter` or a click
 * elsewhere creates it; `Esc` or an empty name gives up, and the folder it was asked from does not move.
 */
export function NewGroupEditor({ compact }: { compact: boolean }) {
    const { pending, submit } = useNewGroup();
    if (!pending) {
        return null;
    }
    const { folder } = pending;

    if (compact) {
        return (
            <NamePopover
                open
                title="New group"
                label="Group name"
                initialValue={DEFAULT_NAME}
                hint={folder ? `${folder.name} moves into it.` : "Drag folders into it, or use “Move to group”."}
                // The rail has no group headers to take the focus.
                onDone={(name) => submit(name, false)}
            >
                <div aria-hidden className="h-0 w-10" />
            </NamePopover>
        );
    }
    return (
        <div className="flex min-h-8 items-center gap-1.5 pl-2.5">
            <ChevronRight aria-hidden className="size-3.5 shrink-0 rotate-90 text-text-muted" />
            <NameField label="Group name" initialValue={DEFAULT_NAME} saveOnBlur onDone={submit} />
        </div>
    );
}
