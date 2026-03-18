import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET")

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  try {
    // Verify webhook secret if configured
    if (REVENUECAT_WEBHOOK_SECRET) {
      const authHeader = req.headers.get("Authorization")
      if (authHeader !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
        return new Response("Unauthorized", { status: 401 })
      }
    }

    const body = await req.json()
    const event = body.event

    if (!event) {
      return new Response("Missing event", { status: 400 })
    }

    const appUserId = event.app_user_id
    if (!appUserId) {
      return new Response("Missing app_user_id", { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Map RevenueCat event types to subscription tier
    const activatingEvents = [
      "INITIAL_PURCHASE",
      "RENEWAL",
      "UNCANCELLATION",
      "PRODUCT_CHANGE",
    ]
    const deactivatingEvents = [
      "EXPIRATION",
      "CANCELLATION",
      "BILLING_ISSUE",
    ]

    const eventType = event.type

    if (activatingEvents.includes(eventType)) {
      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_tier: "premium",
          billing_cycle_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", appUserId)

      if (error) {
        console.error("Failed to activate subscription:", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }
    } else if (deactivatingEvents.includes(eventType)) {
      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_tier: "free",
          updated_at: new Date().toISOString(),
        })
        .eq("id", appUserId)

      if (error) {
        console.error("Failed to deactivate subscription:", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }
    }

    // Reset usage on renewal
    if (eventType === "RENEWAL") {
      const { error } = await supabase
        .from("profiles")
        .update({
          transcription_minutes_used: 0,
          billing_cycle_start: new Date().toISOString(),
        })
        .eq("id", appUserId)

      if (error) {
        console.error("Failed to reset usage:", error)
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("Webhook error:", e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
