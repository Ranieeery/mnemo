/**
 * `bun run check:version [--tag X.Y.Z]`: checks that every file carrying the app's version agrees, and with the
 * release tag when one is given. Reads local files only. Run it before tagging a release: the update check compares
 * the running version with the latest GitHub release tag.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type FoundVersion, parseArguments, VERSION_FILES, versionProblems } from "./versions";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readVersion(path: string, read: (content: string) => string | null): Promise<FoundVersion> {
    try {
        return { path, version: read(await readFile(join(root, path), "utf8")) };
    } catch {
        return { path, version: null };
    }
}

async function main(): Promise<number> {
    const args = parseArguments(process.argv.slice(2));
    if ("error" in args) {
        process.stderr.write(`${args.error}\n`);
        return 2;
    }
    const found = await Promise.all(VERSION_FILES.map(({ path, read }) => readVersion(path, read)));
    const problems = versionProblems(found, args.tag);
    if (problems.length > 0) {
        const list = problems.map((problem) => `- ${problem}`).join("\n");
        process.stderr.write(`Version check failed:\n${list}\n`);
        return 1;
    }
    const version = found[0]?.version ?? "";
    const tagged = args.tag ? ", matching the tag" : "";
    process.stdout.write(`Version ${version} everywhere${tagged}.\n`);
    return 0;
}

process.exitCode = await main();
