import { ExternalLink, RefreshCw } from "lucide-react";
import type { UpdateCheck, UpdateStatus } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { Button, Card, ErrorState, Skeleton, Switch } from "../../../shared/ui";
import { openReleasePage } from "../lib/updates";
import { useCheckForUpdates, useSetAutomaticUpdateChecks, useUpdateStatus } from "../queries";
import { SettingRow } from "./SettingRow";

const checkedAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The newer version to offer: the answer to the last "Check now", or else what an earlier check found. */
function availableVersion(check: UpdateCheck | undefined, status: UpdateStatus): string | null {
    if (check) {
        return check.status === "available" ? check.latest : null;
    }
    return status.available;
}

function resultText(check: ReturnType<typeof useCheckForUpdates>, available: string | null): string {
    if (check.isPending) {
        return "Checking for updates…";
    }
    if (check.isError) {
        return `Could not check for updates: ${errorMessage(check.error)}`;
    }
    if (available) {
        return `Version ${available} is available`;
    }
    return check.data ? `You're up to date (${check.data.running})` : "";
}

type CheckRowProps = { status: UpdateStatus };

function CheckRow({ status }: CheckRowProps) {
    const check = useCheckForUpdates();
    const available = availableVersion(check.data, status);
    const result = resultText(check, available);

    return (
        <SettingRow
            title="Check for updates"
            description={
                <div className="flex flex-col gap-0.5">
                    {/* Polite: results are read out without interrupting. Always present, so changes are announced. */}
                    <p role="status" className={check.isError ? "text-danger-text" : "text-text"}>
                        {result}
                    </p>
                    <p>
                        {status.lastCheckedMs === null
                            ? "Not checked yet"
                            : `Last checked: ${checkedAtFormat.format(status.lastCheckedMs)}`}
                    </p>
                </div>
            }
        >
            {available && (
                <Button icon={<ExternalLink />} onClick={openReleasePage}>
                    View release
                </Button>
            )}
            <Button icon={<RefreshCw />} loading={check.isPending} onClick={() => check.mutate()}>
                {check.isError ? "Retry" : "Check now"}
            </Button>
        </SettingRow>
    );
}

/** Whether Mnemo looks for a newer release on GitHub, and a way to look now. Nothing is downloaded. */
export function UpdatesCard() {
    const status = useUpdateStatus();
    const setAutomatic = useSetAutomaticUpdateChecks();
    if (status.isPending) {
        return <Skeleton className="h-36 w-full" />;
    }
    if (status.isError) {
        return (
            <ErrorState
                title="Could not load the update settings"
                message={errorMessage(status.error)}
                onRetry={() => status.refetch()}
            />
        );
    }
    return (
        <Card className="divide-y divide-border">
            <div className="px-5 py-4">
                <Switch
                    label="Check for updates automatically"
                    description="Once a day, shortly after Mnemo starts, asks GitHub for the latest release and tells you when a newer one is out. Nothing is downloaded or installed."
                    checked={status.data.automatic}
                    disabled={setAutomatic.isPending}
                    onCheckedChange={(enabled) => setAutomatic.mutate(enabled)}
                />
            </div>
            <CheckRow status={status.data} />
        </Card>
    );
}
