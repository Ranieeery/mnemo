import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { buttonClasses } from "../../shared/ui";
import { ControlsSection } from "./components/ControlsSection";
import { FeedbackSection } from "./components/FeedbackSection";
import { FoundationsSection } from "./components/FoundationsSection";
import { OverlaysSection } from "./components/OverlaysSection";

const sections = [
    { id: "foundations", label: "Foundations" },
    { id: "controls", label: "Controls" },
    { id: "feedback", label: "Feedback" },
    { id: "overlays", label: "Overlays and structure" },
];

/** Development-only page with every design system component and its states. Toggle it with Ctrl+Shift+D. */
export function CatalogPage() {
    return (
        <div className="flex h-screen bg-background text-text">
            <nav aria-label="Catalog sections" className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-4">
                <Link to="/" className={buttonClasses("ghost", "sm", "mb-4 justify-start")}>
                    <ArrowLeft className="size-4" aria-hidden />
                    Back to the app
                </Link>
                <p className="px-2 pb-2 text-small font-semibold text-text">Design system</p>
                {sections.map((section) => (
                    <a
                        key={section.id}
                        href={`#${section.id}`}
                        onClick={(event) => {
                            // Hash routing owns the URL fragment, so scroll without touching it.
                            event.preventDefault();
                            document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="rounded-control px-2 py-1.5 text-body text-text-muted hover:bg-surface-hover hover:text-text"
                    >
                        {section.label}
                    </a>
                ))}
            </nav>
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-5xl flex-col gap-14 px-10 py-10">
                    <FoundationsSection />
                    <ControlsSection />
                    <FeedbackSection />
                    <OverlaysSection />
                </div>
            </main>
        </div>
    );
}
