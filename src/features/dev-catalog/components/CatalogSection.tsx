import type { ReactNode } from "react";

type CatalogSectionProps = {
    id: string;
    title: string;
    description?: string;
    children: ReactNode;
};

export function CatalogSection({ id, title, description, children }: CatalogSectionProps) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h2 id={`${id}-title`} className="text-heading font-semibold text-text">
                    {title}
                </h2>
                {description && <p className="max-w-2xl text-body text-text-muted">{description}</p>}
            </header>
            {children}
        </section>
    );
}

type SpecimenProps = {
    label: string;
    children: ReactNode;
};

/** One component state, labelled with what it demonstrates. */
export function Specimen({ label, children }: SpecimenProps) {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-caption text-text-subtle">{label}</span>
            <div className="flex flex-wrap items-center gap-3">{children}</div>
        </div>
    );
}
