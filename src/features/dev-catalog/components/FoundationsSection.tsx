import { cx } from "../../../shared/lib/cx";
import { CatalogSection } from "./CatalogSection";

const colorGroups: { name: string; tokens: string[] }[] = [
    {
        name: "Surfaces",
        tokens: ["background", "surface", "surface-raised", "surface-hover", "border", "border-strong"],
    },
    { name: "Text", tokens: ["text", "text-muted", "text-subtle"] },
    { name: "Accent and status", tokens: ["accent", "accent-hover", "success", "warning", "danger", "focus-ring"] },
];

// Literal class names so Tailwind generates them.
const swatchClasses: Record<string, string> = {
    background: "bg-background",
    surface: "bg-surface",
    "surface-raised": "bg-surface-raised",
    "surface-hover": "bg-surface-hover",
    border: "bg-border",
    "border-strong": "bg-border-strong",
    text: "bg-text",
    "text-muted": "bg-text-muted",
    "text-subtle": "bg-text-subtle",
    accent: "bg-accent",
    "accent-hover": "bg-accent-hover",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    "focus-ring": "bg-focus-ring",
};

const typeScale: { token: string; className: string; sample: string }[] = [
    { token: "display", className: "text-display font-semibold", sample: "Continue watching" },
    { token: "heading", className: "text-heading font-semibold", sample: "Breaking Bad" },
    { token: "title", className: "text-title font-semibold", sample: "Season 1" },
    { token: "lead", className: "text-lead", sample: "Pick up where you left off." },
    { token: "body", className: "text-body", sample: "12 videos, 8 watched. Last opened yesterday." },
    { token: "small", className: "text-small text-text-muted", sample: "S01E03 - And the Bag's in the River.mkv" },
    { token: "caption", className: "text-caption text-text-subtle", sample: "47:12" },
];

const radii: { token: string; className: string }[] = [
    { token: "badge", className: "rounded-badge" },
    { token: "control", className: "rounded-control" },
    { token: "card", className: "rounded-card" },
    { token: "dialog", className: "rounded-dialog" },
];

const shadows: { token: string; className: string }[] = [
    { token: "raised", className: "shadow-raised" },
    { token: "overlay", className: "shadow-overlay" },
    { token: "dialog", className: "shadow-dialog" },
];

export function FoundationsSection() {
    return (
        <CatalogSection
            id="foundations"
            title="Foundations"
            description="Tokens from src/shared/styles/tokens.css. Components use these through Tailwind utilities only."
        >
            <div className="grid gap-6 lg:grid-cols-3">
                {colorGroups.map((group) => (
                    <div key={group.name} className="flex flex-col gap-2">
                        <h3 className="text-body font-medium text-text">{group.name}</h3>
                        <ul className="flex flex-col gap-1.5">
                            {group.tokens.map((token) => (
                                <li key={token} className="flex items-center gap-3">
                                    <span
                                        className={cx(
                                            "size-8 rounded-control border border-border",
                                            swatchClasses[token]
                                        )}
                                    />
                                    <code className="text-small text-text-muted">{token}</code>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-3">
                <h3 className="text-body font-medium text-text">Type scale (Inter Variable)</h3>
                <ul className="flex flex-col gap-3">
                    {typeScale.map(({ token, className, sample }) => (
                        <li key={token} className="grid grid-cols-[6rem_1fr] items-baseline gap-4">
                            <code className="text-caption text-text-subtle">{token}</code>
                            <span className={className}>{sample}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <h3 className="text-body font-medium text-text">Radius</h3>
                    <div className="flex gap-4">
                        {radii.map(({ token, className }) => (
                            <div key={token} className="flex flex-col items-center gap-2">
                                <span
                                    className={cx("size-14 border border-border-strong bg-surface-raised", className)}
                                />
                                <code className="text-caption text-text-subtle">{token}</code>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-3">
                    <h3 className="text-body font-medium text-text">Elevation</h3>
                    <div className="flex gap-6">
                        {shadows.map(({ token, className }) => (
                            <div key={token} className="flex flex-col items-center gap-2">
                                <span className={cx("size-14 rounded-card bg-surface-raised", className)} />
                                <code className="text-caption text-text-subtle">{token}</code>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </CatalogSection>
    );
}
