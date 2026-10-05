import { getRouteApi } from "@tanstack/react-router";
import { HomePage } from "../../features/home";
import { AddFolderButton } from "../../features/library";
import { LibrarySearchResults } from "../../features/search";

const route = getRouteApi("/shell/");

export function HomeRoute() {
    const { q } = route.useSearch();
    if (q) {
        return (
            <div className="flex flex-col gap-6 px-8 py-8">
                <h1 className="text-display font-semibold text-text">Search</h1>
                <LibrarySearchResults query={q} />
            </div>
        );
    }
    return <HomePage addFolderAction={<AddFolderButton />} />;
}
