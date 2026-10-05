import { type FormEvent, useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { Button, Dialog, Input } from "../../../shared/ui";
import { FOLDER_ICON_SUGGESTIONS } from "../lib/folderIcons";
import { singleEmoji } from "../lib/singleEmoji";
import { useSetFolderIcon } from "../queries";

type ChangeIconDialogProps = {
    folder: LibraryFolder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function ChangeIconDialog({ folder, open, onOpenChange }: ChangeIconDialogProps) {
    const setIcon = useSetFolderIcon();
    const [selected, setSelected] = useState<string | null>(folder.customIcon);
    const [custom, setCustom] = useState("");
    const customEmoji = singleEmoji(custom);
    const customError = custom.trim() && !customEmoji ? "Type a single emoji." : undefined;

    const save = (icon: string | null) => {
        setIcon.mutate({ folder, icon }, { onSuccess: () => onOpenChange(false) });
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!customError) {
            save(customEmoji ?? selected);
        }
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
                    <Button
                        variant="primary"
                        type="submit"
                        form="change-icon-form"
                        loading={setIcon.isPending}
                        disabled={Boolean(customError)}
                    >
                        Save icon
                    </Button>
                </>
            }
        >
            <form id="change-icon-form" onSubmit={submit} className="flex flex-col gap-4 pb-2">
                <div role="radiogroup" aria-label="Suggested icons" className="grid grid-cols-10 gap-1">
                    {FOLDER_ICON_SUGGESTIONS.map((icon) => (
                        // biome-ignore lint/a11y/useSemanticElements: a grid of emoji buttons reads better than radio inputs.
                        <button
                            key={icon}
                            type="button"
                            role="radio"
                            aria-checked={selected === icon && !customEmoji}
                            aria-label={icon}
                            onClick={() => {
                                setSelected(icon);
                                setCustom("");
                            }}
                            className={cx(
                                "flex aspect-square items-center justify-center rounded-control text-title",
                                "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-hover",
                                selected === icon && !customEmoji && "bg-surface-hover ring-2 ring-accent"
                            )}
                        >
                            {icon}
                        </button>
                    ))}
                </div>
                <Input
                    label="Or type any emoji"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    error={customError}
                    maxLength={16}
                />
            </form>
        </Dialog>
    );
}
