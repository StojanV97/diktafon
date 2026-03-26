import {
  plansFile,
  readJSON, writeJSON, withWriteLock, generateUUID,
} from "./storageCore";

export async function fetchPlans() {
  const plans = await readJSON(plansFile);
  return plans
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function createPlan(date: string, items: string[]) {
  return withWriteLock(async () => {
    const plans = await readJSON(plansFile);
    const now = new Date().toISOString();
    const plan = {
      id: generateUUID(),
      date,
      items,
      created_at: now,
      updated_at: now,
    };
    plans.unshift(plan);
    await writeJSON(plansFile, plans);
    return plan;
  });
}

export function updatePlan(planId: string, items: string[]) {
  return withWriteLock(async () => {
    const plans = await readJSON(plansFile);
    const plan = plans.find((p: any) => p.id === planId);
    if (!plan) return null;
    plan.items = items;
    plan.updated_at = new Date().toISOString();
    await writeJSON(plansFile, plans);
    return { ...plan };
  });
}

export function deletePlan(planId: string) {
  return withWriteLock(async () => {
    const plans = await readJSON(plansFile);
    const idx = plans.findIndex((p: any) => p.id === planId);
    if (idx === -1) return false;
    plans.splice(idx, 1);
    await writeJSON(plansFile, plans);
    return true;
  });
}
