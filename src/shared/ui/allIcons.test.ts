import { iconNames } from "lucide-react/dynamic";
import { describe, expect, it } from "vitest";
import { ALL_ICONS, iconNameOf } from "./allIcons";

describe("iconNameOf", () => {
    it("follows lucide's naming", () => {
        expect(iconNameOf("Film")).toBe("film");
        expect(iconNameOf("Gamepad2")).toBe("gamepad-2");
        expect(iconNameOf("AArrowDown")).toBe("a-arrow-down");
        expect(iconNameOf("CalendarX2")).toBe("calendar-x-2");
        expect(iconNameOf("Grid2x2Check")).toBe("grid-2x2-check");
        expect(iconNameOf("UsbCPort")).toBe("usb-c-port");
    });

    it("gives every icon a name lucide itself uses", () => {
        // Guards the conversion against new icon names in lucide updates.
        const official = new Set<string>(iconNames);
        expect([...ALL_ICONS.keys()].filter((name) => !official.has(name))).toEqual([]);
        expect(ALL_ICONS.size).toBeGreaterThan(1000);
    });
});
