import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Toaster, TooltipProvider } from "../ui";

/** Renders inside the providers the app root installs, and returns a user-event instance. */
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
