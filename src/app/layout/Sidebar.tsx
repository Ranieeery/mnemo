import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { History, House, Settings } from "lucide-react";
import { LibraryNav } from "../../features/library";
import { cx } from "../../shared/lib/cx";

const navLinkClasses = (active: boolean) =>
    cx(
        "flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body",
        "transition-colors duration-(--duration-fast) ease-standard",
        active ? "bg-surface-raised font-medium text-text" : "text-text-muted hover:bg-surface-hover hover:text-text"
    );

export function Sidebar() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = useSearch({ strict: false });
    const isHome = pathname === "/";
    const isHistory = pathname === "/history";
    const isSettings = pathname === "/settings";

    return (
        <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-4">
            <Link
                to="/"
                aria-label="Mnemo, go to home"
                className="flex items-center gap-2 self-start rounded-control px-2.5"
            >
                <img src="/logo.png" alt="" className="size-6 rounded-badge" />
                <span className="text-title font-semibold tracking-tight text-text">Mnemo</span>
            </Link>
            <nav aria-label="Main" className="flex flex-col gap-0.5">
                <Link to="/" aria-current={isHome ? "page" : undefined} className={navLinkClasses(isHome)}>
                    <House className="size-4" aria-hidden />
                    Home
                </Link>
                <Link to="/history" aria-current={isHistory ? "page" : undefined} className={navLinkClasses(isHistory)}>
                    <History className="size-4" aria-hidden />
                    History
                </Link>
            </nav>
            <LibraryNav currentPath={pathname === "/folder" ? search.path : undefined} />
            <Link
                to="/settings"
                aria-current={isSettings ? "page" : undefined}
                className={cx(navLinkClasses(isSettings), "mt-auto")}
            >
                <Settings className="size-4" aria-hidden />
                Settings
            </Link>
        </aside>
    );
}
