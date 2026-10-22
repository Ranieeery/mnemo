// PreToolUse hook: turns rules from CLAUDE.md into hard stops. Refuses editing the generated bindings, changing a
// migration that already exists, and git commands that commit, push or create branches or tags.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type HookInput, projectDir, readHookInput } from "./input";

const BINDINGS = "src/shared/ipc/bindings.ts";
const MIGRATIONS = "src-tauri/src/db/migrations.rs";

/** Subcommands that write commits or publish them. */
const COMMITTING = new Set(["commit", "push", "merge", "rebase", "cherry-pick", "revert", "am", "pull"]);

function deny(reason: string): never {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
            },
        })
    );
    process.exit(0);
}

function normalized(path: string): string {
    return path.replaceAll("\\", "/");
}

/** Why a shell command breaks the git rules, or `null` when it does not. */
function gitViolation(command: string): string | null {
    // Each `git <subcommand> <rest>` up to the next separator, skipping `-C <dir>` and `-c <key=value>`.
    const pattern = /\bgit((?:\s+-[cC]\s+\S+)*)\s+([a-z-]+)([^\n;&|]*)/g;
    for (const [, , subcommand = "", rest = ""] of command.matchAll(pattern)) {
        const args = rest.trim().split(/\s+/).filter(Boolean);
        const has = (...flags: string[]) => args.some((arg) => flags.includes(arg));
        if (COMMITTING.has(subcommand) || has("--no-verify")) {
            return `git ${subcommand}`;
        }
        const createsBranch =
            (subcommand === "branch" &&
                (args.some((arg) => !arg.startsWith("-")) || has("-d", "-D", "-m", "-M", "-c", "-C"))) ||
            (subcommand === "checkout" && has("-b", "-B", "--orphan")) ||
            (subcommand === "switch" && has("-c", "-C", "--create", "--force-create", "--orphan")) ||
            (subcommand === "worktree" && has("add"));
        if (createsBranch) {
            return `git ${subcommand} ${args.join(" ")}`.trim();
        }
        // A name creates a tag unless listing (`-l "2.*"`); flags alone only list.
        const namesTag = args.some((arg) => !arg.startsWith("-")) && !has("-l", "--list");
        if (subcommand === "tag" && (namesTag || has("-d", "--delete"))) {
            return `git tag ${args.join(" ")}`;
        }
    }
    return null;
}

/** The migrations listed in `migrations()`, in order, each with the text of the constant holding its SQL. */
function migrationsIn(source: string): { entry: string; sql: string }[] {
    const list = source.slice(source.indexOf("fn migrations()"));
    return [...list.matchAll(/M::up(?:_with_hook)?\((\w+)[^)]*\)/g)].map(([entry, name = ""]) => {
        const start = source.indexOf(`const ${name}:`);
        if (start === -1) {
            return { entry, sql: "" };
        }
        const quote = source.indexOf('"', start);
        const isRaw = source.slice(quote - 2, quote) === "r#";
        const end = isRaw ? source.indexOf('"#;', quote) : source.indexOf('";', quote + 1);
        return { entry, sql: source.slice(start, end) };
    });
}

/** Why `after` changes a migration `before` already had, or `null` when it only adds new ones. */
function migrationViolation(before: string, after: string): string | null {
    const old = migrationsIn(before);
    const next = migrationsIn(after);
    for (const [index, migration] of old.entries()) {
        const kept = next[index];
        if (kept?.entry !== migration.entry) {
            return `migration ${index + 1} (${migration.entry}) was removed, replaced or moved`;
        }
        if (kept.sql !== migration.sql) {
            return `migration ${index + 1} (${migration.entry}) has different SQL`;
        }
    }
    return null;
}

/** The file as the edit would leave it, or `null` when the tool itself will refuse the edit. */
function contentAfter(toolName: string, path: string, toolInput: NonNullable<HookInput["tool_input"]>): string | null {
    if (toolName === "Write") {
        return typeof toolInput.content === "string" ? toolInput.content : null;
    }
    const { old_string: oldString, new_string: newString, replace_all: replaceAll } = toolInput;
    if (typeof oldString !== "string" || typeof newString !== "string" || !existsSync(path)) {
        return null;
    }
    const current = readFileSync(path, "utf8");
    return replaceAll === true ? current.replaceAll(oldString, newString) : current.replace(oldString, newString);
}

const { tool_name: toolName = "", tool_input: toolInput = {} } = await readHookInput();

if (typeof toolInput.command === "string") {
    const violation = gitViolation(toolInput.command);
    if (violation) {
        deny(
            `"${violation}" is not allowed in this repository (CLAUDE.md): the user reviews and commits. ` +
                "Change the files and hand over the `git add` commands and a suggested commit message instead."
        );
    }
}

if (typeof toolInput.file_path === "string") {
    const path = resolve(projectDir(), toolInput.file_path);
    const file = normalized(path);
    if (file.endsWith(`/${BINDINGS}`)) {
        deny(`${BINDINGS} is generated: change the Rust commands or types and run \`cargo test\` in src-tauri.`);
    }
    if (file.endsWith(`/${MIGRATIONS}`) && existsSync(path)) {
        const after = contentAfter(toolName, path, toolInput);
        const violation = after === null ? null : migrationViolation(readFileSync(path, "utf8"), after);
        if (violation) {
            deny(`Existing migrations never change (CLAUDE.md): ${violation}. Add a new migration at the end instead.`);
        }
    }
}
