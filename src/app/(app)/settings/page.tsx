import { PageHeader } from "@/components/page-header";
import { getActiveConfig } from "@/lib/services/config";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

function Field({
  name,
  label,
  value,
  step = "0.01",
  hint,
}: {
  name: string;
  label: string;
  value: number;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={value}
        className="tnum w-full rounded border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default async function SettingsPage() {
  const { id, weights, thresholds } = await getActiveConfig();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`Saving creates a new config version. Active version: #${id}. Old scores keep their version.`}
      />

      <form action={saveSettings} className="max-w-2xl space-y-8">
        <section>
          <h2 className="mb-3 text-sm text-muted">Signal weights (docs/04 §5)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="w_mkt" label="Market prior" value={weights.w_mkt} />
            <Field name="w_llm" label="LLM / news" value={weights.w_llm} />
            <Field name="w_base" label="Base rate" value={weights.w_base} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Renormalized over present signals. Re-fit only from resolved predictions, not by hand-tuning.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm text-muted">Thresholds</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="net_edge_min" label="Net-edge min" value={thresholds.net_edge_min} hint="e.g. 0.05 = 5pp" />
            <Field name="net_edge_min_longshot" label="Longshot min" value={thresholds.net_edge_min_longshot} hint="e.g. 0.08 = 8pp" />
            <Field name="exit_friction" label="Exit friction" value={thresholds.exit_friction} />
            <Field name="min_volume" label="Min volume" value={thresholds.min_volume} step="1" />
            <Field name="max_spread" label="Max spread" value={thresholds.max_spread} />
            <Field name="enrich_top_k" label="Enrich top-K" value={thresholds.enrich_top_k} step="1" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm text-muted">Budget & bankroll</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="llm_daily_budget_usd" label="LLM daily budget (USD)" value={thresholds.llm_daily_budget_usd} step="0.5" />
            <Field name="bankroll_usd" label="Bankroll (USD, sizing display)" value={thresholds.bankroll_usd} step="100" />
          </div>
        </section>

        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          Save new config version
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Excluded categories ({thresholds.excluded_categories.join(", ") || "none"}) are managed via
        seed config and carried forward on save. Re-run the score job after changing weights to
        produce scores under the new version.
      </p>
    </>
  );
}
