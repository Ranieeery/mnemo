import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { useKeyboardShortcutsQuery } from "../../../shared/ipc/queries";
import { Button, Card, ConfirmDialog, ErrorState, Kbd, Skeleton } from "../../../shared/ui";
import { actionUsing, copyShortcuts, SHORTCUT_GROUPS, type ShortcutAction, withKeys } from "../lib/actions";
import { useSaveShortcuts } from "../queries";
import { ShortcutRow } from "./ShortcutRow";

const headingId = (title: string) => `shortcuts-${title.toLowerCase().replace(/\W+/g, "-")}`;

/** The Shortcuts tab of Settings: every configurable action with its keys. Changes apply and save at once. */
export function ShortcutsSettings() {
    const query = useKeyboardShortcutsQuery();
    const save = useSaveShortcuts();
    const [confirmingReset, setConfirmingReset] = useState(false);

    if (query.isPending) {
        return (
            <div className="flex flex-col gap-3">
                {["a", "b", "c", "d", "e", "f"].map((key) => (
                    <Skeleton key={key} className="h-10 w-full" />
                ))}
            </div>
        );
    }
    if (query.isError) {
        return (
            <ErrorState
                title="Could not load the shortcuts"
                message={errorMessage(query.error)}
                onRetry={() => query.refetch()}
            />
        );
    }

    const shortcuts = query.data;
    const change = (action: ShortcutAction, keys: readonly string[], takeFrom?: ShortcutAction) => {
        const moved = takeFrom ? keys.find((key) => shortcuts[takeFrom].includes(key)) : undefined;
        save.mutate({
            shortcuts: withKeys(
                shortcuts,
                action,
                keys,
                takeFrom && moved ? { action: takeFrom, combo: moved } : undefined
            ),
            message: "Shortcut saved",
        });
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <p className="max-w-xl text-body text-text-muted">
                    Choose the keys for each action; each can have up to two. Press <Kbd>?</Kbd> anywhere to see them
                    all.
                </p>
                <Button icon={<RotateCcw />} onClick={() => setConfirmingReset(true)}>
                    Restore all defaults
                </Button>
            </div>
            {SHORTCUT_GROUPS.map((group) => (
                <section key={group.title} aria-labelledby={headingId(group.title)} className="flex flex-col gap-3">
                    {/* Outside the card, so the section reads as a heading rather than as one more row. */}
                    <h3 id={headingId(group.title)} className="text-title font-semibold text-text">
                        {group.title}
                    </h3>
                    <Card>
                        <ul aria-label={group.title} className="divide-y divide-border">
                            {group.actions.map(({ action, label }) => (
                                <ShortcutRow
                                    key={action}
                                    label={label}
                                    keys={shortcuts[action]}
                                    defaults={DEFAULT_KEYBOARD_SHORTCUTS[action]}
                                    owner={(combo) => {
                                        const user = actionUsing(shortcuts, combo);
                                        return user === action ? null : user;
                                    }}
                                    onChange={(keys, takeFrom) => change(action, keys, takeFrom)}
                                />
                            ))}
                        </ul>
                    </Card>
                </section>
            ))}
            <ConfirmDialog
                open={confirmingReset}
                onOpenChange={setConfirmingReset}
                title="Restore all default shortcuts?"
                description="Every action goes back to its original keys. Your changes are lost."
                confirmLabel="Restore defaults"
                onConfirm={() =>
                    save.mutate({
                        shortcuts: copyShortcuts(DEFAULT_KEYBOARD_SHORTCUTS),
                        message: "Restored the default shortcuts",
                    })
                }
            />
        </div>
    );
}
