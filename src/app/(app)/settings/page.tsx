import { PageHeader, Placeholder } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Bankroll, signal weights, thresholds and category filters."
      />
      <Placeholder>
        Editable weights/thresholds (each write creates a new config_version) arrive in M3. Crypto and
        sports are excluded by default via seed config.
      </Placeholder>
    </>
  );
}
