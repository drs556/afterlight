"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/authz";
import { getActiveConfig } from "@/lib/services/config";

const num = (v: FormDataEntryValue | null) => Number(v);

const formSchema = z.object({
  w_mkt: z.number().min(0),
  w_llm: z.number().min(0),
  w_base: z.number().min(0),
  net_edge_min: z.number().min(0).max(1),
  net_edge_min_longshot: z.number().min(0).max(1),
  min_volume: z.number().min(0),
  max_spread: z.number().min(0).max(1),
  exit_friction: z.number().min(0).max(1),
  llm_daily_budget_usd: z.number().min(0),
  enrich_top_k: z.number().int().min(1),
  bankroll_usd: z.number().min(0),
});

/**
 * Save settings as a NEW config_versions row (docs/01 §3.5, §M3 acceptance):
 * every change is versioned; existing scores keep their config_version, so
 * old rows are never mutated. Category exclusions carry forward from the
 * current active config.
 */
export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = formSchema.parse({
    w_mkt: num(formData.get("w_mkt")),
    w_llm: num(formData.get("w_llm")),
    w_base: num(formData.get("w_base")),
    net_edge_min: num(formData.get("net_edge_min")),
    net_edge_min_longshot: num(formData.get("net_edge_min_longshot")),
    min_volume: num(formData.get("min_volume")),
    max_spread: num(formData.get("max_spread")),
    exit_friction: num(formData.get("exit_friction")),
    llm_daily_budget_usd: num(formData.get("llm_daily_budget_usd")),
    enrich_top_k: num(formData.get("enrich_top_k")),
    bankroll_usd: num(formData.get("bankroll_usd")),
  });

  const current = await getActiveConfig();

  await db.insert(schema.configVersions).values({
    weights: { w_mkt: parsed.w_mkt, w_llm: parsed.w_llm, w_base: parsed.w_base },
    thresholds: {
      net_edge_min: parsed.net_edge_min,
      net_edge_min_longshot: parsed.net_edge_min_longshot,
      min_volume: parsed.min_volume,
      max_spread: parsed.max_spread,
      exit_friction: parsed.exit_friction,
      llm_daily_budget_usd: parsed.llm_daily_budget_usd,
      enrich_top_k: parsed.enrich_top_k,
      bankroll_usd: parsed.bankroll_usd,
      // Category exclusions are managed via seed config; carry them forward.
      excluded_categories: current.thresholds.excluded_categories,
    },
    note: "settings update",
  });

  revalidatePath("/settings");
  revalidatePath("/opportunities");
}
