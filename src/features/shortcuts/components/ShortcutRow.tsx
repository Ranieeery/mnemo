import { Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { MAX_KEYS_PER_SHORTCUT } from "../../../shared/ipc/bindings";
import { comboLabel, isReservedCombo } from "../../../shared/lib/keyboard";
import { Button, IconButton } from "../../../shared/ui";
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

    const record = (combo: string) => {
        setRecording(false);
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
        onChange([...keys, combo]);
    };

    return (
        <li className="flex flex-col gap-2 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <span className="min-w-40 text-body text-text">{label}</span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {keys.map((combo) => (
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
                                onClick={() => onChange(keys.filter((key) => key !== combo))}
                            />
                        </span>
                    ))}
                    {keys.length === 0 && !recording && <span className="text-small text-text-subtle">Not set</span>}
                    {recording ? (
                        <KeyRecorder label={label} onRecord={record} onCancel={() => setRecording(false)} />
                    ) : (
                        keys.length < MAX_KEYS_PER_SHORTCUT && (
                            <Button
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
                                        onChange([...keys, problem.combo], from);
                                    }
                                }}
                            >
                                Use here instead
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setProblem(null)}>
                        {problem.owner === null ? "OK" : "Cancel"}
                    </Button>
                </div>
            )}
        </li>
    );
}
