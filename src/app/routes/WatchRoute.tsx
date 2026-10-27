import { getRouteApi, Navigate } from "@tanstack/react-router";
import { PlayerPage } from "../../features/player";
import { VideoTagList } from "../../features/tags";

const route = getRouteApi("/watch");

/** Tags are their own feature: the player gets them through this route. */
function videoTags(videoId: number) {
    return <VideoTagList videoId={videoId} />;
}

export function WatchRoute() {
    const { path } = route.useSearch();
    if (!path) {
        return <Navigate to="/" replace />;
    }
    return <PlayerPage key={path} path={path} videoTags={videoTags} />;
}
