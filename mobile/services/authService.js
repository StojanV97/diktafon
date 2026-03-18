import * as AppleAuthentication from "expo-apple-authentication"
import { supabase } from "./supabaseClient"

// ── Sign in with Apple ─────────────────────────────────

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })

  if (!credential.identityToken) {
    throw new Error("Apple Sign In: identityToken is missing")
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  })

  if (error) throw error
  return data
}

// ── Session helpers ────────────────────────────────────

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session)
    }
  )
  return subscription
}

// ── Profile (auto-created by Supabase trigger) ────────

export async function getProfile() {
  const user = await getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (error) {
    // Profile might not exist yet — create it
    if (error.code === "PGRST116") {
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({ id: user.id })
        .select()
        .single()
      if (insertError) throw insertError
      return newProfile
    }
    throw error
  }
  return data
}
