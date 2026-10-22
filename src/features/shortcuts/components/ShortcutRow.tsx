import { Plus, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { MAX_KEYS_PER_SHORTCUT } from "../../../shared/ipc/bindings";
import { comboLabel, isReservedCombo } from "../../../shared/lib/keyboard";
import { Button, elementNear, IconButton, useFocusAfterRemoval } from "../../../shared/ui";
import { actionLabel, type ShortcutAction } from "../lib/actions";
import { ComboKeys } from "./ComboKeys";
import { KeyRecorder } from "./KeyRecorder";

type ShortcutRowProps = {
    label: string;
    keys: readonly string[];
    defaults: readonly string[];
    /** The action that already uses a combination, if any. */
    owner: (combo: string) => ShortcutAction | null;
    /** Gives the action new keys; `takeFrom` loses `combo` when a key moves from another action. */
    onChange: (keys: readonly string[], takeFrom?: ShortcutAction) => void;
};

type Problem = { combo: string; owner: ShortcutAction | null };

/** One action in Settings: its keys, adding (by pressing the key), removing and resetting. */
export function ShortcutRow({ label, keys, defaults, owner, onChange }: ShortcutRowProps) {
    const [recording, setRecording] = useState(false);
    const [problem, setProblem] = useState<Problem | null>(null);
    const isDefault = keys.length === defaults.length && keys.every((key, index) => key === defaults[index]);
    const keysRef = useRef<HTMLDivElement>(null);
    const addRef = useRef<HTMLButtonElement>(null);
    const focusAfterRemoval = useFocusAfterRemoval();
    const removeButtons = () => keysRef.current?.querySelectorAll<HTMLElement>("[data-remove-key]");

    const remove = (index: number) => {
        focusAfterRemoval(() => elementNear(removeButtons(), index) ?? addRef.current);
        onChange(keys.filter((_, other) => other !== index));
    };

    // At the key limit there is no "Add key": the last key takes focus instead.
    const focusRowAfterRemoval = () =>
        focusAfterRemoval(() => addRef.current ?? elementNear(removeButtons(), MAX_KEYS_PER_SHORTCUT));

    const add = (combo: string, takeFrom?: ShortcutAction) => {
        // The new key arrives in a later render; when it fills the row, "Add key" leaves and the new key takes focus.
        const fillsRow = keys.length + 1 >= MAX_KEYS_PER_SHORTCUT;
        focusAfterRemoval(() => (fillsRow ? removeButtons()?.[keys.length] : addRef.current));
        onChange([...keys, combo], takeFrom);
    };

    const stopRecording = () => {
        focusRowAfterRemoval();
        setRecording(false);
    };

    const dismissProblem = () => {
        focusRowAfterRemoval();
        setProblem(null);
    };

    const record = (combo: string) => {
        stopRecording();
        if (keys.includes(combo)) {
            setProblem(null);
            return;
        }
        if (isReservedCombo(combo)) {
            setProblem({ combo, owner: null });
            return;
        }
        const current = owner(combo);
        if (current) {
            setProblem({ combo, owner: current });
            return;
        }
        setProblem(null);
        add(combo);
    };

    return (
        <li className="flex flex-col gap-2 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <span className="min-w-40 text-body text-text">{label}</span>
                <div ref={keysRef} className="flex flex-wrap items-center justify-end gap-2">
                    {keys.map((combo, index) => (
                        <span
                            key={combo}
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-surface-raised py-0.5 pr-0.5 pl-2"
                        >
                            <ComboKeys combo={combo} />
                            <IconButton
                                label={`Remove ${comboLabel(combo)} from ${label}`}
                                icon={<X />}
                                size="sm"
                                className="size-6"
                                data-remove-key
                                onClick={() => remove(index)}
                            />
                        </span>
                    ))}
                    {keys.length === 0 && !recording && <span className="text-small text-text-subtle">Not set</span>}
                    {recording ? (
                        <KeyRecorder label={label} onRecord={record} onCancel={stopRecording} />
                    ) : (
                        keys.length < MAX_KEYS_PER_SHORTCUT && (
                            <Button
                                ref={addRef}
                                variant="ghost"
                                size="sm"
                                icon={<Plus />}
                                aria-label={`Add a key for ${label}`}
                                onClick={() => {
                                    setProblem(null);
                                    setRecording(true);
                                }}
                            >
                                Add key
                            </Button>
                        )
                    )}
                    {!isDefault && (
                        <IconButton
                            label={`Reset ${label} to its default keys`}
                            icon={<RotateCcw />}
                            size="sm"
                            onClick={() => {
                                setProblem(null);
                                onChange(defaults.filter((combo) => owner(combo) === null || keys.includes(combo)));
                            }}
                        />
                    )}
                </div>
            </div>
            {problem && (
                <div role="alert" className="flex flex-wrap items-center justify-end gap-2 text-small">
                    {problem.owner === null ? (
                        <span className="text-text-muted">
                            {comboLabel(problem.combo)} is reserved and can't be used.
                        </span>
                    ) : (
                        <>
                            <span className="text-text-muted">
                                {comboLabel(problem.combo)} is already used by {actionLabel(problem.owner)}.
                            </span>
                            <Button
                                size="sm"
                                onClick={() => {
                                    const from = problem.owner;
                                    setProblem(null);
                                    if (from) {
                                        add(problem.combo, from);
                                    }
                                }}
                            >
                                Use here instead
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" size="sm" onClick={dismissProblem}>
                        {problem.owner === null ? "OK" : "Cancel"}
                    </Button>
                </div>
            )}
        </li>
    );
}
