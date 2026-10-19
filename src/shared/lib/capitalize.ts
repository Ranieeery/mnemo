/** The text with its first letter in upper case, for names shown from values: `capitalize("teal")` is "Teal". */
export function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
