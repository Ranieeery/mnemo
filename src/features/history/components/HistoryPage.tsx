import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
import { WatchedVideos } from "./WatchedVideos";
import { WatchStatistics } from "./WatchStatistics";

/** What was watched and when: the list of watched videos, and watched time statistics on their own tab. */
export function HistoryPage() {
    return (
        <div className="flex max-w-5xl flex-col gap-6 px-8 py-8">
            <h1 className="text-display font-semibold text-text">History</h1>
            <Tabs defaultValue="watched">
                <TabsList>
                    <TabsTrigger value="watched">Watched videos</TabsTrigger>
                    <TabsTrigger value="statistics">Statistics</TabsTrigger>
                </TabsList>
                <TabsContent value="watched">
                    <WatchedVideos />
                </TabsContent>
                <TabsContent value="statistics">
                    <WatchStatistics />
                </TabsContent>
            </Tabs>
        </div>
    );
}
