import { PageHeader, Placeholder } from "@/components/page-header";

export default function TrackRecordPage() {
  return (
    <>
      <PageHeader
        title="Track record"
        subtitle="Our Brier score vs. the market-price baseline. This page is why the MVP exists."
      />
      <Placeholder>
        Calibration, Brier vs. baseline and paper PnL arrive in M4, with progress toward 200 resolved
        predictions shown until then.
      </Placeholder>
    </>
  );
}
