import { useQuery } from "@tanstack/react-query";
import { commands } from "../../shared/ipc/bindings";
import { call } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";

/** Upper bound of cards per row; each section shows as many as fit, so resizing never refetches. */
const HOME_SECTION_LIMIT = 12;

export function useHome() {
    return useQuery({
        queryKey: queryKeys.home(HOME_SECTION_LIMIT),
        queryFn: () => call(commands.getHome(HOME_SECTION_LIMIT)),
    });
}
