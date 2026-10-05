import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { baseName } from "../../shared/lib/paths";
import { IconButton, SearchInput } from "../../shared/ui";
import { useHistoryNavigation } from "../navigation/useHistoryNavigation";

/** Typing pauses this long before the search runs, so every keystroke does not hit the disk or the database. */
const SEARCH_DEBOUNCE_MS = 300;

export function TopBar() {
    const { canGoBack, canGoForward, back, forward } = useHistoryNavigation();

    return (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            <div className="flex items-center gap-1">
                <IconButton label="Back" shortcut="Alt+←" icon={<ArrowLeft />} disabled={!canGoBack} onClick={back} />
                <IconButton
                    label="Forward"
                    shortcut="Alt+→"
                    icon={<ArrowRight />}
                    disabled={!canGoForward}
                    onClick={forward}
                />
            </div>
            <SearchField />
        </div>
    );
}

/**
 * Search of the current screen, kept in the URL (`q`): the library on the home page, files on disk inside a folder.
 */
function SearchField() {
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = useSearch({ strict: false });
    const folderPath = pathname === "/folder" ? search.path : undefined;
    const urlQuery = search.q ?? "";
    const [value, setValue] = useState(urlQuery);

    // Follow the URL when it changes on its own (back/forward, opening another folder).
    useEffect(() => {
        setValue(urlQuery);
    }, [urlQuery]);

    useEffect(() => {
        if (value === urlQuery) {
            return;
        }
        const timer = window.setTimeout(() => {
            const q = value.trim() ? value : undefined;
            void (folderPath
                ? navigate({ to: "/folder", search: { path: folderPath, q }, replace: true })
                : navigate({ to: "/", search: { q }, replace: true }));
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [value, urlQuery, folderPath, navigate]);

    return (
        <SearchInput
            label={folderPath ? `Search in ${baseName(folderPath)}` : "Search the library"}
            placeholder={folderPath ? `Search in ${baseName(folderPath)}` : "Search titles, descriptions and tags"}
            value={value}
            onValueChange={setValue}
            className="ml-auto w-full max-w-md"
        />
    );
}
