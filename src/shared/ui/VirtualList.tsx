import { useVirtualizer } from "@tanstack/react-virtual";
import { type Key, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useScrollElement } from "./ScrollContainer";

/** Short lists render directly: virtualizing them costs more than it saves. */
const VIRTUALIZE_FROM = 40;

type VirtualListProps<T> = {
    items: readonly T[];
    getKey: (item: T) => Key;
    /** Expected height in px; items are measured after render, so this only needs to be close. */
    estimateSize: (item: T) => number;
    renderItem: (item: T) => ReactNode;
    className?: string;
};

/** A vertical list that only renders the items near the viewport of the enclosing {@link ScrollContainer}. */
export function VirtualList<T>({ items, getKey, estimateSize, renderItem, className }: VirtualListProps<T>) {
    if (items.length < VIRTUALIZE_FROM) {
        return (
            <div className={className}>
                {items.map((item) => (
                    <div key={getKey(item)}>{renderItem(item)}</div>
                ))}
            </div>
        );
    }
    return (
        <VirtualizedList
            items={items}
            getKey={getKey}
            estimateSize={estimateSize}
            renderItem={renderItem}
            className={className}
        />
    );
}

function VirtualizedList<T>({ items, getKey, estimateSize, renderItem, className }: VirtualListProps<T>) {
    const scrollElement = useScrollElement();
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [, setMounted] = useState(false);

    // The scroll container is an ancestor, and React attaches an ancestor's ref only after its children's layout
    // effects ran. Render once more after mounting so the virtualizer finds the scroll element.
    useLayoutEffect(() => {
        setMounted(true);
    }, []);

    // The list rarely starts at the top of the scroll area (headers come first); the virtualizer needs that offset.
    useLayoutEffect(() => {
        setScrollMargin(listRef.current?.offsetTop ?? 0);
    });

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollElement.current,
        estimateSize: (index) => {
            const item = items[index];
            return item === undefined ? 0 : estimateSize(item);
        },
        getItemKey: (index) => {
            const item = items[index];
            return item === undefined ? index : getKey(item);
        },
        overscan: 4,
        scrollMargin,
    });

    return (
        <div ref={listRef} className={className} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = items[virtualItem.index];
                return item === undefined ? null : (
                    <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        className="absolute top-0 left-0 w-full"
                        style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
                    >
                        {renderItem(item)}
                    </div>
                );
            })}
        </div>
    );
}
