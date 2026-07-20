import { PageHeader, Placeholder } from "@/components/page-header";

export default function RunsPage() {
  return (
    <>
      <PageHeader title="Runs" subtitle="Pipeline run history and health." />
      <Placeholder>The pipeline_runs ledger and per-job “Run now” controls go live in M1.</Placeholder>
    </>
  );
}
