/**
 * Where the app's version is written, and the checks `bun run check:version` runs on them. Pure: the files are read
 * by `check-version.ts`.
 */

type VersionFile = {
    /** Relative to the repository root. */
    path: string;
    /** The version written in the file's content, or `null` when it cannot be found. */
    read: (content: string) => string | null;
};

/** A release version: `X.Y.Z`, without a `v`. The update check compares it with the GitHub release tag. */
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

function jsonVersion(content: string): string | null {
    try {
        const parsed: unknown = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
            return typeof parsed.version === "string" ? parsed.version : null;
        }
    } catch {
        // Unreadable JSON has no version; the caller reports the file.
    }
    return null;
}

/** `version` of the `[package]` table, before any other table starts. */
function cargoTomlVersion(content: string): string | null {
    return /^\[package\]\r?\n(?:(?!\[)[^\n]*\n)*?version\s*=\s*"([^"]+)"/m.exec(content)?.[1] ?? null;
}

/** The lock entry of the app itself: other crates may share its version number. */
function cargoLockVersion(content: string): string | null {
    return /^\[\[package\]\]\r?\nname = "mnemo"\r?\nversion = "([^"]+)"/m.exec(content)?.[1] ?? null;
}

function readmeVersion(content: string): string | null {
    return /<strong>Version ([^<\s]+)<\/strong>/.exec(content)?.[1] ?? null;
}

export const VERSION_FILES: readonly VersionFile[] = [
    { path: "package.json", read: jsonVersion },
    { path: "src-tauri/Cargo.toml", read: cargoTomlVersion },
    { path: "src-tauri/Cargo.lock", read: cargoLockVersion },
    { path: "src-tauri/tauri.conf.json", read: jsonVersion },
    { path: "README.md", read: readmeVersion },
];

export type FoundVersion = { path: string; version: string | null };

/** What is wrong with the versions found, and with the release tag when one is given; empty when all agree. */
export function versionProblems(found: readonly FoundVersion[], tag?: string): string[] {
    const problems: string[] = [];
    for (const { path, version } of found) {
        if (version === null) {
            problems.push(`${path}: no version found`);
        } else if (!RELEASE_VERSION.test(version)) {
            problems.push(`${path}: "${version}" is not a release version (X.Y.Z)`);
        }
    }
    const versions = new Set(found.flatMap(({ version }) => (version === null ? [] : [version])));
    if (versions.size > 1) {
        const list = found.map(({ path, version }) => `  ${path}: ${version ?? "(none)"}`).join("\n");
        problems.push(`the files carry different versions:\n${list}`);
    }
    if (tag !== undefined) {
        if (!RELEASE_VERSION.test(tag)) {
            const hint = tag.startsWith("v") ? `; tags have no "v", use ${tag.slice(1)}` : "";
            problems.push(`the tag "${tag}" is not a release version (X.Y.Z)${hint}`);
        } else if (versions.size === 1 && !versions.has(tag)) {
            problems.push(`the tag ${tag} differs from the version in the files (${[...versions].join("")})`);
        }
    }
    return problems;
}

export type Arguments = { tag?: string } | { error: string };

export function parseArguments(args: readonly string[]): Arguments {
    if (args.length === 0) {
        return {};
    }
    const [flag, tag, ...rest] = args;
    if (flag !== "--tag" || tag === undefined || tag.startsWith("--") || rest.length > 0) {
        return { error: "usage: bun run check:version [--tag X.Y.Z]" };
    }
    return { tag };
}
