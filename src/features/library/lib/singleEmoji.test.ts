import { describe, expect, it } from "vitest";
import { FOLDER_ICON_SUGGESTIONS } from "./folderIcons";
import { singleEmoji } from "./singleEmoji";

describe("singleEmoji", () => {
    it.each(["🎬", " 📺 ", "👍🏽", "🇧🇷", "👨‍👩‍👧"])("accepts %s", (value) => {
        expect(singleEmoji(value)).toBe(value.trim());
    });

    it.each(["", "a", "🎬🎬", "ab", "1"])("rejects %j", (value) => {
        expect(singleEmoji(value)).toBeNull();
    });

    it("accepts every suggested icon, and there are more than 70 of them", () => {
        expect(FOLDER_ICON_SUGGESTIONS.length).toBeGreaterThan(70);
        for (const icon of FOLDER_ICON_SUGGESTIONS) {
            expect(singleEmoji(icon)).toBe(icon);
        }
    });
});
