import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "../../../shared/ipc/queries";
import { Button, Dialog, Kbd } from "../../../shared/ui";
import { SHORTCUT_GROUPS } from "../lib/actions";
import { ActionKeys } from "./ComboKeys";

type ShortcutsHelpDialogProps = {
    onClose: () => void;
    /** Opens the place where shortcuts are changed. */
    onCustomize: () => void;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1.5">
            <dt className="text-small text-text-muted">{label}</dt>
            <dd className="shrink-0">{children}</dd>
        </div>
    );
}

/** Every shortcut with the keys it has now, opened with "?" from any screen. */
export function ShortcutsHelpDialog({ onClose, onCustomize }: ShortcutsHelpDialogProps) {
    const shortcuts = useKeyboardShortcuts();

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Keyboard shortcuts"
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onCustomize}>
                        Customize in Settings
                    </Button>
                    <Button variant="primary" onClick={onClose}>
                        Close
                    </Button>
                </>
            }
        >
            <div className="grid gap-x-10 gap-y-6 pb-2 sm:grid-cols-2">
                {SHORTCUT_GROUPS.map((group) => (
                    <section key={group.title} aria-label={group.title}>
                        <h3 className="mb-1 text-small font-semibold text-text">{group.title}</h3>
                        <dl className="divide-y divide-border">
                            {group.actions.map(({ action, label }) => (
                                <Row key={action} label={label}>
                                    <ActionKeys keys={shortcuts[action]} />
                                </Row>
                            ))}
                        </dl>
                    </section>
                ))}
                <section aria-label="Always available">
                    <h3 className="mb-1 text-small font-semibold text-text">Always available</h3>
                    <dl className="divide-y divide-border">
                        <Row label="Leave full screen or close the player">
                            <Kbd>Esc</Kbd>
                        </Row>
                        <Row label="Show keyboard shortcuts">
                            <Kbd>?</Kbd>
                        </Row>
                        <Row label="Mouse back button">
                            <span className="text-small text-text">Go back</span>
                        </Row>
                        <Row label="Mouse forward button">
                            <span className="text-small text-text">Go forward</span>
                        </Row>
                    </dl>
                </section>
            </div>
        </Dialog>
    );
}
