import {
    createHashHistory,
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    type RouterHistory,
} from "@tanstack/react-router";
import { AppShell } from "./layout/AppShell";
import { RootLayout } from "./RootLayout";
import { FolderRoute } from "./routes/FolderRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { validateFolderSearch, validateHomeSearch, validateWatchSearch } from "./routes/searchParams";

function NotFound() {
    return null;
}

/**
 * Builds the app router. Browsing screens share the shell (sidebar and top bar); the player takes the whole window.
 * The player and settings load on demand. The design system catalog only exists in development builds: the inline
 * `import.meta.env.DEV` check lets Vite drop its import from production bundles. Hash history keeps routing
 * independent from how Tauri serves files.
 */
export function createAppRouter(history: RouterHistory = createHashHistory()) {
    const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

    const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: "shell", component: AppShell });
    const homeRoute = createRoute({
        getParentRoute: () => shellRoute,
        path: "/",
        validateSearch: validateHomeSearch,
        component: HomeRoute,
    });
    const folderRoute = createRoute({
        getParentRoute: () => shellRoute,
        path: "/folder",
        validateSearch: validateFolderSearch,
        component: FolderRoute,
    });
    const settingsRoute = createRoute({
        getParentRoute: () => shellRoute,
        path: "/settings",
        component: lazyRouteComponent(() => import("./routes/SettingsRoute"), "SettingsRoute"),
    });

    const watchRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/watch",
        validateSearch: validateWatchSearch,
        component: lazyRouteComponent(() => import("./routes/WatchRoute"), "WatchRoute"),
    });
    const catalogRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/dev/catalog",
        component: import.meta.env.DEV
            ? lazyRouteComponent(() => import("../features/dev-catalog/CatalogPage"), "CatalogPage")
            : NotFound,
    });

    return createRouter({
        routeTree: rootRoute.addChildren([
            shellRoute.addChildren([homeRoute, folderRoute, settingsRoute]),
            watchRoute,
            catalogRoute,
        ]),
        history,
        defaultPreload: "intent",
    });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof createAppRouter>;
    }
}
