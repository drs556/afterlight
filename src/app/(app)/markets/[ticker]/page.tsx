import { PageHeader, Placeholder } from "@/components/page-header";

export default function MarketDetailPage({ params }: { params: { ticker: string } }) {
  return (
    <>
      <PageHeader title={`Market · ${params.ticker}`} subtitle="Audit why the model believes what it believes." />
      <Placeholder>
        Verdict, signal breakdown, reasoning, price history and market facts arrive across M1–M3.
      </Placeholder>
    </>
  );
}
