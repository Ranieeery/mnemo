import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "../lib/breadcrumbs";

/** Path from the library folder to the current folder; every ancestor is a link. */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
    return (
        <nav aria-label="Folder path">
            <ol className="flex flex-wrap items-center gap-1 text-small text-text-muted">
                {crumbs.map((crumb, index) => {
                    const isCurrent = index === crumbs.length - 1;
                    return (
                        <li key={crumb.path} className="flex items-center gap-1">
                            {index > 0 && <ChevronRight className="size-3.5 text-text-subtle" aria-hidden />}
                            {isCurrent ? (
                                <span aria-current="page" className="text-text">
                                    {crumb.name}
                                </span>
                            ) : (
                                <Link
                                    to="/folder"
                                    search={{ path: crumb.path }}
                                    className="rounded-badge hover:text-text hover:underline underline-offset-4"
                                >
                                    {crumb.name}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
