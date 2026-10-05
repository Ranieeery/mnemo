import { describe, expect, it } from "vitest";
import { CommandError, call, errorMessage, isErrorKind } from "./client";

describe("call", () => {
    it("resolves with the data of a successful command", async () => {
        await expect(call(Promise.resolve({ status: "ok" as const, data: 42 }))).resolves.toBe(42);
    });

    it("rejects with a CommandError that keeps the kind", async () => {
        const failed = call(
            Promise.resolve({
                status: "error" as const,
                error: { kind: "mediaToolMissing" as const, message: "ffprobe is not installed" },
            })
        );
        await expect(failed).rejects.toBeInstanceOf(CommandError);
        await failed.catch((error: unknown) => {
            expect(errorMessage(error)).toBe("ffprobe is not installed");
            expect(isErrorKind(error, "mediaToolMissing")).toBe(true);
            expect(isErrorKind(error, "cancelled")).toBe(false);
        });
    });
});

describe("errorMessage", () => {
    it("handles strings and unknown values", () => {
        expect(errorMessage("disk full")).toBe("disk full");
        expect(errorMessage({ weird: true })).toBe("Unexpected error");
        expect(isErrorKind(new Error("x"), "io")).toBe(false);
    });
});
