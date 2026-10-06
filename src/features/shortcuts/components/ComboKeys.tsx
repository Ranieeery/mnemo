import { Fragment } from "react";
import { comboParts } from "../../../shared/lib/keyboard";
import { Kbd } from "../../../shared/ui";

/** One key combination as keycaps: "Alt+ArrowLeft" shows as [Alt] [←]. */
export function ComboKeys({ combo }: { combo: string }) {
    return (
        <span>
            <span className="sr-only">{combo.split("+").join(" plus ")}</span>
            {/* Screen readers get the text above; "←" and friends do not read well. */}
            <span aria-hidden className="inline-flex items-center gap-0.5">
                {comboParts(combo).map((part, index) => (
                    <Fragment key={part}>
                        {index > 0 && <span className="text-caption text-text-subtle">+</span>}
                        <Kbd>{part}</Kbd>
                    </Fragment>
                ))}
            </span>
        </span>
    );
}

/** Every key of an action, "or" between them; "Not set" when it has none. */
export function ActionKeys({ keys }: { keys: readonly string[] }) {
    if (keys.length === 0) {
        return <span className="text-small text-text-subtle">Not set</span>;
    }
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            {keys.map((combo, index) => (
                <Fragment key={combo}>
                    {index > 0 && <span className="text-caption text-text-subtle">or</span>}
                    <ComboKeys combo={combo} />
                </Fragment>
            ))}
        </span>
    );
}
