import {
    createHashHistory,
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    type RouteComponent,
    type RouterHistory,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout";

function NotFound() {
    return null;
}

/**
 * Builds the app router. `home` is the screen mounted at "/"; until the new UI replaces it, the legacy app is passed
 * in by the entry point so this module never imports legacy code.
 *
 * Hash history keeps routing independent from how Tauri serves files, and the catalog route only has a component in
 * development builds (the import disappears from production bundles).
 */
export function createAppRouter(home: RouteComponent, history: RouterHistory = createHashHistory()) {
    const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });
    const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: home });
    const catalogRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/dev/catalog",
        component: import.meta.env.DEV
            ? lazyRouteComponent(() => import("../features/dev-catalog/CatalogPage"), "CatalogPage")
            : NotFound,
    });

    return createRouter({
        routeTree: rootRoute.addChildren([homeRoute, catalogRoute]),
        history,
        defaultPreload: "intent",
    });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof createAppRouter>;
    }
}
