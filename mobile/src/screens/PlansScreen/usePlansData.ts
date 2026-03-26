import { useState, useCallback } from "react";
import { fetchPlans, createPlan, updatePlan, deletePlan } from "../../services/storage";
import { safeErrorMessage } from "../../../utils/errorHelpers";

export function usePlansData(setSnackbar: (msg: string) => void) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchPlans();
      setPlans(data);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [setSnackbar]);

  const addPlan = useCallback(async (date: string, items: string[]) => {
    const plan = await createPlan(date, items);
    try { await load(); } catch {}
    return plan;
  }, [load]);

  const editPlan = useCallback(async (planId: string, items: string[]) => {
    const updated = await updatePlan(planId, items);
    if (updated) {
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
    }
  }, []);

  const removePlan = useCallback(async (planId: string) => {
    await deletePlan(planId);
    setPlans((prev) => prev.filter((p) => p.id !== planId));
  }, []);

  return { plans, loading, load, addPlan, editPlan, removePlan };
}
