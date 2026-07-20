import { PageHeader, Placeholder } from "@/components/page-header";

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Ranked markets where the model disagrees with Kalshi profitably."
      />
      <Placeholder>
        The ranked opportunities table lands in M3 (scoring). M1 renders market data only.
      </Placeholder>
    </>
  );
}
