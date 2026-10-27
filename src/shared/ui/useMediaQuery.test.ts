import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setWindowWidth } from "../test/window";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
    it("follows the window as it crosses the query", () => {
        setWindowWidth(1200);
        const { result } = renderHook(() => useMediaQuery("(max-width: 999.98px)"));
        expect(result.current).toBe(false);

        act(() => setWindowWidth(800));
        expect(result.current).toBe(true);

        act(() => setWindowWidth(1000));
        expect(result.current).toBe(false);
    });
});
