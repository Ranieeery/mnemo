import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createQueryClient } from "../ipc/queryClient";
import { ScrollContainer, Toaster, TooltipProvider } from "../ui";

/** Renders inside the UI providers the app root installs, and returns a user-event instance. */
export function renderWithUi(ui: ReactElement) {
    const user = userEvent.setup();
    const result = render(
        <TooltipProvider delayDuration={0}>
            {ui}
            <Toaster />
        </TooltipProvider>
    );
    return { user, ...result };
}

/**
 * Renders a screen with everything it needs at runtime: a fresh query cache, a router (so links work and navigation
 * can be asserted through `router.state.location`), the scroll container and the UI providers. The router renders
 * asynchronously, so query the screen with `findBy*`.
 */
export function renderScreen(ui: ReactElement, initialEntries: string[] = ["/"]) {
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
    const rootRoute = createRootRoute({
        component: () => (
            <QueryClientProvider client={queryClient}>
                <TooltipProvider delayDuration={0}>
                    <ScrollContainer className="h-screen">{ui}</ScrollContainer>
                    <Toaster />
                </TooltipProvider>
            </QueryClientProvider>
        ),
    });
    const router = createRouter({
        routeTree: rootRoute,
        history: createMemoryHistory({ initialEntries, initialIndex: initialEntries.length - 1 }),
    });
    render(<RouterProvider router={router} />);
    return { user, router, queryClient };
}
