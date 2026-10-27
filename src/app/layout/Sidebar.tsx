import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { History, House, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { LibraryNav } from "../../features/library";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "../../shared/ipc/bindings";
import { cx } from "../../shared/lib/cx";
import { IconButton, ResizablePanel, sidebarItemClasses, Tooltip } from "../../shared/ui";
import type { SidebarDrawer } from "./useSidebarDrawer";
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
                "relative flex h-9 items-center gap-2.5 [&_svg]:size-4 [&_svg]:shrink-0",
                collapsed ? "w-10 justify-center" : "px-2.5",
                sidebarItemClasses(active),
                // The screens' own icons take the accent when current; folders keep the color the user chose.
                active && "[&_svg]:text-accent",
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
 * so every screen and folder stays one click away; both are kept between sessions. In a narrow window it is always a
 * rail, and expanding it opens it over the screen until `Esc`, a click outside or another screen closes it.
 */
export function Sidebar({ drawer }: { drawer: SidebarDrawer }) {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = useSearch({ strict: false });
    const sidebar = useSidebarPreferences();
    const toggleRef = useRef<HTMLButtonElement>(null);

    if (!sidebar.preferences) {
        return null;
    }
    const { width } = sidebar.preferences;
    const collapsed = drawer.narrow ? !drawer.open : sidebar.preferences.collapsed;
    const closeDrawer = () => {
        drawer.setOpen(false);
        toggleRef.current?.focus();
    };

    const panel = (
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
            onKeyDown={
                drawer.open
                    ? (event) => {
                          if (event.key === "Escape") {
                              event.preventDefault();
                              closeDrawer();
                          }
                      }
                    : undefined
            }
            className={cx(
                // Set apart from the screen by its layer; the transparent edge shows in Windows high contrast mode.
                "flex shrink-0 flex-col border-r border-transparent bg-surface",
                drawer.narrow ? "absolute inset-y-0 left-0 z-40" : "relative",
                // The drawer covers the screen, so it is not held to a third of the window to leave the screen room.
                !collapsed && (drawer.narrow ? "max-w-[calc(100vw-4rem)] min-w-50" : "max-w-[calc(100vw/3)] min-w-50"),
                drawer.open && "shadow-overlay"
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
                        ref={toggleRef}
                        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                        tooltipSide="right"
                        aria-expanded={!collapsed}
                        aria-controls={SIDEBAR_ID}
                        onClick={drawer.narrow ? () => drawer.setOpen(!drawer.open) : sidebar.toggleCollapsed}
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

    if (!drawer.narrow) {
        return panel;
    }
    // The rail keeps its place in the layout; the open drawer spreads over the screen from it.
    return (
        <div className="relative w-14 shrink-0">
            {drawer.open && (
                // A pointer shortcut, hidden from assistive technology; `Esc` closes the drawer from the keyboard.
                <div aria-hidden className="fixed inset-0 z-30 animate-appear bg-overlay" onClick={closeDrawer} />
            )}
            {panel}
        </div>
    );
}
