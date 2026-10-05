import { getRouteApi, Navigate } from "@tanstack/react-router";
import { FolderPage } from "../../features/browser";
import { FolderSearchResults } from "../../features/search";

const route = getRouteApi("/shell/folder");

export function FolderRoute() {
    const { path, q } = route.useSearch();
    if (!path) {
        return <Navigate to="/" replace />;
    }
    return <FolderPage path={path} content={q ? <FolderSearchResults path={path} query={q} /> : undefined} />;
}
