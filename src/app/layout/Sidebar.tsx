import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { History, House, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { LibraryNav } from "../../features/library";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "../../shared/ipc/bindings";
import { cx } from "../../shared/lib/cx";
import { IconButton, ResizablePanel, Tooltip } from "../../shared/ui";
import { useSidebarPreferences } from "./useSidebarPreferences";

const SIDEBAR_ID = "sidebar";

type NavLinkProps = {
    to: "/" | "/history" | "/settings";
    label: string;
    icon: ReactNode;
    active: boolean;
    /** In the collapsed rail only the icon shows; the name moves to a tooltip and the accessible name. */
    collapsed: boolean;
    className?: string;
};

function NavLink({ to, label, icon, active, collapsed, className }: NavLinkProps) {
    const link = (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            className={cx(
                "flex h-9 items-center gap-2.5 rounded-control text-body [&_svg]:size-4 [&_svg]:shrink-0",
                "transition-colors duration-(--duration-fast) ease-standard",
                collapsed ? "w-10 justify-center" : "px-2.5",
                active
                    ? "bg-surface-raised font-medium text-text"
                    : "text-text-muted hover:bg-surface-hover hover:text-text",
                className
            )}
        >
            {icon}
            {!collapsed && label}
        </Link>
    );
    return collapsed ? (
        <Tooltip content={label} side="right">
            {link}
        </Tooltip>
    ) : (
        link
    );
}

/**
 * Navigation and library folders. Its edge can be dragged to change its width, and it collapses to a rail of icons,
 * so every screen and folder stays one click away; both are kept between sessions.
 */
export function Sidebar() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = useSearch({ strict: false });
    const sidebar = useSidebarPreferences();

    if (!sidebar.preferences) {
        return null;
    }
    const { collapsed, width } = sidebar.preferences;

    return (
        <ResizablePanel
            id={SIDEBAR_ID}
            aria-label="Sidebar"
            side="left"
            width={width}
            minWidth={MIN_SIDEBAR_WIDTH}
            maxWidth={MAX_SIDEBAR_WIDTH}
            maxViewportFraction={1 / 3}
            onWidthChange={sidebar.setWidth}
            onReset={sidebar.resetWidth}
            resizeLabel="Resize sidebar"
            collapsed={collapsed}
            collapsedClassName="w-14"
            className={cx(
                "relative flex shrink-0 flex-col border-r border-border bg-surface",
                !collapsed && "max-w-[calc(100vw/3)] min-w-50"
            )}
        >
            {/* Clips the contents while the width animates, without clipping the edge's handle. */}
            <div
                className={cx(
                    "flex min-h-0 flex-1 flex-col gap-6 overflow-hidden py-4 whitespace-nowrap",
                    collapsed ? "items-center px-2" : "px-3"
                )}
            >
                <div className="flex items-center justify-between gap-2">
                    {!collapsed && (
                        <Link
                            to="/"
                            aria-label="Mnemo, go to home"
                            className="flex min-w-0 items-center gap-2 rounded-control px-2.5"
                        >
                            <img src="/logo.png" alt="" className="size-6 shrink-0 rounded-badge" />
                            <span className="text-title font-semibold tracking-tight text-text">Mnemo</span>
                        </Link>
                    )}
                    {/* The same element in both states, so it keeps the focus after a click. */}
                    <IconButton
                        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                        tooltipSide="right"
                        aria-expanded={!collapsed}
                        aria-controls={SIDEBAR_ID}
                        onClick={sidebar.toggleCollapsed}
                    />
                </div>
                <nav aria-label="Main" className="flex flex-col gap-0.5">
                    <NavLink to="/" label="Home" icon={<House />} active={pathname === "/"} collapsed={collapsed} />
                    <NavLink
                        to="/history"
                        label="History"
                        icon={<History />}
                        active={pathname === "/history"}
                        collapsed={collapsed}
                    />
                </nav>
                <LibraryNav currentPath={pathname === "/folder" ? search.path : undefined} compact={collapsed} />
                <NavLink
                    to="/settings"
                    label="Settings"
                    icon={<Settings />}
                    active={pathname === "/settings"}
                    collapsed={collapsed}
                    className="mt-auto"
                />
            </div>
        </ResizablePanel>
    );
}
