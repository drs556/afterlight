import { PageHeader } from "@/components/page-header";
import { getOpportunities, getRankedOpportunities } from "@/lib/services/markets";
import { getLastSuccessfulIngest } from "@/lib/services/runs";
import { relativeTime } from "@/lib/format";
import { OpportunitiesTable } from "./opportunities-table";
import { MarketsTable } from "./markets-table";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const [ranked, lastIngest] = await Promise.all([
    getRankedOpportunities(),
    getLastSuccessfulIngest(),
  ]);
  const lastIngestLabel = relativeTime(lastIngest);

  // Before any scores exist, fall back to the market-data view (M1).
  if (ranked.length === 0) {
    const { rows, total } = await getOpportunities();
    return (
      <>
        <PageHeader
          title="Opportunities"
          subtitle="Market data only — run enrich then score to populate model columns."
        />
        <MarketsTable rows={rows} total={total} lastIngestLabel={lastIngestLabel} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Where the model disagrees with Kalshi profitably, ranked by evidence-weighted edge."
      />
      <OpportunitiesTable rows={ranked} lastIngestLabel={lastIngestLabel} />
    </>
  );
}
