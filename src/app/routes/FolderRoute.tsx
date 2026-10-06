import { getRouteApi, Navigate } from "@tanstack/react-router";
import { DEFAULT_ORDER, FolderPage, type VideoOrder } from "../../features/browser";
import { FolderSearchResults } from "../../features/search";

const route = getRouteApi("/shell/folder");

export function FolderRoute() {
    const { path, q, sort = DEFAULT_ORDER.sort, status = DEFAULT_ORDER.status } = route.useSearch();
    const navigate = route.useNavigate();
    if (!path) {
        return <Navigate to="/" replace />;
    }

    // Replacing the entry keeps back/forward for moving between folders; defaults stay out of the URL.
    const changeOrder = (order: VideoOrder) =>
        navigate({
            search: (previous) => ({
                ...previous,
                sort: order.sort === DEFAULT_ORDER.sort ? undefined : order.sort,
                status: order.status === DEFAULT_ORDER.status ? undefined : order.status,
            }),
            replace: true,
        });

    return (
        <FolderPage
            path={path}
            content={q ? <FolderSearchResults path={path} query={q} /> : undefined}
            order={{ sort, status }}
            onOrderChange={changeOrder}
        />
    );
}
