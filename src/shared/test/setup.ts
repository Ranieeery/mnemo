import "@testing-library/jest-dom/vitest";
import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { queryClient } from "../ipc/queryClient";
import { resetDialogs } from "../stores/dialogs";
import { resetProcessingSession } from "../stores/processing";
import { resetToasts } from "../ui";
import { installMediaElementStub } from "./media";

beforeEach(() => {
    mockConvertFileSrc("windows");
});

afterEach(() => {
    cleanup();
    clearMocks();
    // App-wide singletons outlive a test; start every test from a clean slate.
    queryClient.clear();
    resetProcessingSession();
    resetToasts();
    resetDialogs();
});

installMediaElementStub();

// jsdom lacks browser APIs that Radix primitives rely on.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.scrollTo ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
window.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
});
