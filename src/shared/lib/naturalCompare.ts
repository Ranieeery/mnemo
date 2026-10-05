const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Compares strings the way people expect file names to be ordered: embedded numbers compare by value
 * ("Ep 2" before "Ep 10"), and case and accents are ignored.
 */
export function naturalCompare(a: string, b: string): number {
    return collator.compare(a, b);
}
