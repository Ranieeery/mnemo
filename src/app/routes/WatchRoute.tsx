import { getRouteApi, Navigate } from "@tanstack/react-router";
import { PlayerPage } from "../../features/player";

const route = getRouteApi("/watch");

export function WatchRoute() {
    const { path } = route.useSearch();
    if (!path) {
        return <Navigate to="/" replace />;
    }
    return <PlayerPage key={path} path={path} />;
}
