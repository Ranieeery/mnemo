import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Keyboard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFolderName, useKeyboardShortcuts } from "../../shared/ipc/queries";
import { debounce } from "../../shared/lib/debounce";
import { shortcutHint } from "../../shared/lib/keyboard";
import { openShortcutsHelp } from "../../shared/stores/dialogs";
import { IconButton, SearchInput } from "../../shared/ui";
import { useHistoryNavigation } from "../navigation/useHistoryNavigation";

/** Typing pauses this long before the search runs, so every keystroke does not hit the disk or the database. */
const SEARCH_DEBOUNCE_MS = 300;

export function TopBar() {
    const { canGoBack, canGoForward, back, forward } = useHistoryNavigation();
    const shortcuts = useKeyboardShortcuts();
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = useSearch({ strict: false });
    const folderPath = pathname === "/folder" ? search.path : undefined;

    return (
        // Three columns keep the search centered whatever the sides hold. Set apart from the screen by its layer; the
        // transparent edge shows in Windows high contrast mode.
        <div className="grid h-14 shrink-0 grid-cols-[1fr_minmax(0,44rem)_1fr] items-center gap-3 border-b border-transparent px-4">
            <div className="flex items-center gap-1">
                <IconButton
                    label="Back"
                    shortcut={shortcutHint(shortcuts.historyBack)}
                    icon={<ArrowLeft />}
                    disabled={!canGoBack}
                    onClick={back}
                />
                <IconButton
                    label="Forward"
                    shortcut={shortcutHint(shortcuts.historyForward)}
                    icon={<ArrowRight />}
                    disabled={!canGoForward}
                    onClick={forward}
                />
            </div>
            {/* Each screen has its own field: a search typed on the screen being left, and not run yet, is dropped. */}
            <SearchField key={folderPath ?? pathname} folderPath={folderPath} urlQuery={search.q ?? ""} />
            <IconButton
                label="Keyboard shortcuts"
                shortcut="?"
                icon={<Keyboard />}
                onClick={openShortcutsHelp}
                className="justify-self-end"
            />
        </div>
    );
}

/**
 * Search of the current screen, kept in the URL (`q`): the library on the home page, files on disk inside a folder.
 */
function SearchField({ folderPath, urlQuery }: { folderPath: string | undefined; urlQuery: string }) {
    const navigate = useNavigate();
    const folderLabel = useFolderName(folderPath ?? "");
    const [value, setValue] = useState(urlQuery);
    const pendingSearch = useMemo(
        () =>
            debounce((text: string) => {
                const q = text.trim() ? text : undefined;
                // Inside a folder the search keeps its order and filter.
                void (folderPath
                    ? navigate({
                          from: "/folder",
                          to: "/folder",
                          search: (previous) => ({ ...previous, q }),
                          replace: true,
                      })
                    : navigate({ to: "/", search: { q }, replace: true }));
            }, SEARCH_DEBOUNCE_MS),
        [folderPath, navigate]
    );

    // Follow the URL when it changes on its own (back/forward, the logo clearing the search).
    useEffect(() => {
        setValue(urlQuery);
        return () => pendingSearch.cancel();
    }, [pendingSearch, urlQuery]);

    const changeValue = (next: string) => {
        setValue(next);
        if (next === urlQuery) {
            pendingSearch.cancel();
        } else {
            pendingSearch.schedule(next);
        }
    };

    return (
        <SearchInput
            label={folderPath ? `Search in ${folderLabel}` : "Search the library"}
            placeholder={folderPath ? `Search in ${folderLabel}` : "Search titles, descriptions and tags"}
            value={value}
            onValueChange={changeValue}
            className="w-full"
        />
    );
}
