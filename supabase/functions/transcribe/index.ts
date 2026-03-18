import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check premium subscription
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier, transcription_minutes_used, billing_cycle_start")
      .eq("id", user.id)
      .single()

    if (!profile || profile.subscription_tier !== "premium") {
      return new Response(JSON.stringify({ error: "Premium subscription required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check usage cap (120 min/month)
    if (profile.transcription_minutes_used >= 120) {
      return new Response(JSON.stringify({ error: "Monthly transcription limit reached (120 min)" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const url = new URL(req.url)
    const path = url.pathname.split("/").pop()

    if (req.method === "POST" && path === "submit") {
      return await handleSubmit(req, supabase, user.id, corsHeaders)
    }

    if (req.method === "POST" && path === "status") {
      return await handleStatus(req, corsHeaders)
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

async function handleSubmit(
  req: Request,
  supabase: any,
  userId: string,
  headers: Record<string, string>,
) {
  const { storage_path, speaker_labels } = await req.json()

  // Generate signed URL for the uploaded audio
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("audio-uploads")
    .createSignedUrl(storage_path, 3600)

  if (signedUrlError) {
    return new Response(JSON.stringify({ error: "Failed to get audio URL" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  // Submit to AssemblyAI
  const res = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: signedUrlData.signedUrl,
      language_code: "sr",
      speaker_labels: speaker_labels ?? true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return new Response(JSON.stringify({ error: `AssemblyAI error: ${body}` }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const data = await res.json()

  return new Response(JSON.stringify({ assemblyai_id: data.id }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

async function handleStatus(req: Request, headers: Record<string, string>) {
  const { id } = await req.json()

  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
    headers: { authorization: ASSEMBLYAI_API_KEY },
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "AssemblyAI status check failed" }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const data = await res.json()

  if (data.status === "completed") {
    const text = formatUtterances(data)
    const duration_seconds = Math.round(data.audio_duration || 0)
    return new Response(JSON.stringify({ status: "done", text, duration_seconds }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  if (data.status === "error") {
    return new Response(JSON.stringify({ status: "error", error: data.error }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ status: "processing" }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

function formatUtterances(data: any): string {
  if (!data.utterances || data.utterances.length === 0) {
    return data.text || ""
  }

  return data.utterances
    .map((u: any) => {
      const startSec = (u.start || 0) / 1000
      const m = Math.floor(startSec / 60)
      const s = Math.floor(startSec % 60)
      const timestamp = `${m}:${s.toString().padStart(2, "0")}`
      return `[Govornik ${u.speaker} – ${timestamp}] ${u.text}`
    })
    .join("\n")
}
