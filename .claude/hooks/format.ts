// PostToolUse hook: formats the file Claude just edited, with the project's own formatters. Never blocks: a file that
// does not parse yet is left alone, and the checks report it later.
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { projectDir, readHookInput } from "./input";

const BIOME_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css"]);

const input = await readHookInput();
const filePath = input.tool_input?.file_path;
if (typeof filePath === "string") {
    const project = projectDir();
    const file = resolve(project, filePath);
    const inProject = relative(project, file);
    if (!inProject.startsWith("..") && !isAbsolute(inProject)) {
        const extension = extname(file);
        if (BIOME_EXTENSIONS.has(extension)) {
            // From the project root, so biome.json (and its ignored files) apply.
            spawnSync("bunx", ["biome", "format", "--write", "--no-errors-on-unmatched", file], {
                cwd: project,
                shell: process.platform === "win32",
            });
        } else if (extension === ".rs") {
            // rustfmt finds src-tauri/rustfmt.toml from the file's directory.
            spawnSync("rustfmt", ["--edition", "2024", file], { cwd: project });
        }
    }
}
