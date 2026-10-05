import { Search, X } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { cx } from "../lib/cx";
import { inputClasses } from "./Input";
import { Spinner } from "./Spinner";

type SearchInputProps = {
    value: string;
    onValueChange: (value: string) => void;
    /** Accessible name of the field. */
    label: string;
    placeholder?: string;
    /** Shows a spinner while results load. */
    busy?: boolean;
    className?: string;
};

export function SearchInput({ value, onValueChange, label, placeholder, busy = false, className }: SearchInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const clear = () => {
        onValueChange("");
        inputRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        // Escape clears a non-empty search first; only an empty field lets it bubble (e.g. to close something).
        if (event.key === "Escape" && value) {
            event.stopPropagation();
            clear();
        }
    };

    return (
        <div className={cx("relative flex items-center", className)}>
            <Search className="pointer-events-none absolute left-3 size-4 text-text-subtle" aria-hidden />
            <input
                ref={inputRef}
                type="search"
                aria-label={label}
                aria-busy={busy || undefined}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onValueChange(event.target.value)}
                onKeyDown={handleKeyDown}
                className={cx(inputClasses, "pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden")}
            />
            <div className="absolute right-2 flex items-center">
                {busy ? (
                    <Spinner className="text-text-muted" />
                ) : (
                    value && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={clear}
                            className="flex size-6 items-center justify-center rounded-badge text-text-muted hover:bg-surface-hover hover:text-text"
                        >
                            <X className="size-4" aria-hidden />
                        </button>
                    )
                )}
            </div>
        </div>
    );
}
