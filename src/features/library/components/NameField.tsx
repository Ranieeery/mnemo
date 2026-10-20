import { type KeyboardEvent, type ReactElement, useEffect, useRef } from "react";
import { MAX_FOLDER_NAME_CHARS } from "../../../shared/ipc/bindings";
import { Input, Popover, PopoverAnchor, PopoverContent } from "../../../shared/ui";

/**
 * Ends an edit: `name` is the value to save, or `null` to cancel. `restoreFocus` returns the focus to what was
 * renamed (after `Enter` or `Esc`); a click elsewhere leaves it where the user clicked.
 */
export type NameDone = (name: string | null, restoreFocus: boolean) => void;

type NameFieldProps = {
    label: string;
    initialValue: string;
    placeholder?: string;
    /** Shown under the field (in the popover); inline there is no room, so the label is only for screen readers. */
    hint?: string;
    /** Saves when the field loses the focus (inline). The popover saves on a click outside instead. */
    saveOnBlur: boolean;
    onDone: NameDone;
};

/** A name being edited: starts with the current one selected; `Enter` saves and `Esc` cancels. */
export function NameField({ label, initialValue, placeholder, hint, saveOnBlur, onDone }: NameFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    // `Enter` removes the field, which could also blur it: the edit ends once.
    const done = useRef(false);
    const finish = (name: string | null, restoreFocus: boolean) => {
        if (!done.current) {
            done.current = true;
            onDone(name, restoreFocus);
        }
    };

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
            label={label}
            hideLabel={hint === undefined}
            hint={hint}
            className="min-w-0 flex-1"
            defaultValue={initialValue}
            placeholder={placeholder}
            maxLength={MAX_FOLDER_NAME_CHARS}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={handleKeyDown}
            onBlur={saveOnBlur ? (event) => finish(event.currentTarget.value, false) : undefined}
        />
    );
}

type NamePopoverProps = Omit<NameFieldProps, "saveOnBlur"> & {
    open: boolean;
    /** Names the popover for screen readers, e.g. "Rename Anime". */
    title: string;
    /** What the popover opens next to. */
    children: ReactElement;
};

/** Edits a name where there is no room for a field (the collapsed sidebar): a click outside saves. */
export function NamePopover({ open, title, children, onDone, ...field }: NamePopoverProps) {
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
                aria-label={title}
                // The field focuses itself; what was renamed gets the focus back from `onDone` when it should.
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={() => onDone(currentValue(), false)}
            >
                <NameField {...field} onDone={onDone} saveOnBlur={false} />
            </PopoverContent>
        </Popover>
    );
}
