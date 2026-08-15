import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { DEMO_ACCOUNTS, type DemoAccount } from "./demoAccounts";
import type { Organization } from "../lib/types";

type AuthState = {
  session: Session | null;
  org: Organization | null;
  loading: boolean;
  signInWithDemo: (account: DemoAccount) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadOrg: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const ORG_COLUMNS =
  "id,name,org_type,verified,nearest_station,area_label,relay_credits,completed_transfers";

async function fetchOrg(userId: string): Promise<Organization | null> {
  const membership = await supabase
    .from("org_members")
    .select(`org_id, organizations!inner(${ORG_COLUMNS})`)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membership.error || !membership.data) return null;
  return membership.data.organizations as unknown as Organization;
}

// デモアカウントは seed に依存せず、初回ログイン時に組織を作って紐づける。
// (seed が入っている環境では既存の org_members が優先される)
async function ensureOrg(userId: string, account: DemoAccount): Promise<Organization | null> {
  const existing = await fetchOrg(userId);
  if (existing) return existing;

  const created = await supabase
    .from("organizations")
    .insert({
      name: account.orgName,
      org_type: account.orgType,
      verified: true,
      nearest_station: account.nearestStation,
      area_label: account.areaLabel,
      location: account.location,
    })
    .select(ORG_COLUMNS)
    .single();
  if (created.error || !created.data) return null;

  const org = created.data as unknown as Organization;
  await supabase.from("org_members").insert({ org_id: org.id, user_id: userId, role: "owner" });
  await supabase.from("org_locations").insert({
    org_id: org.id,
    exact_address: account.exactAddress,
    contact_name: account.contactName,
    contact_phone: account.contactPhone,
    access_note: account.accessNote,
  });
  return org;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingDemo = useRef<DemoAccount | null>(null);

  const syncOrg = useCallback(async (userId: string) => {
    const demo = pendingDemo.current;
    pendingDemo.current = null;
    setOrg(demo ? await ensureOrg(userId, demo) : await fetchOrg(userId));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await syncOrg(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // private channel の authorization に JWT が必要 (docs/edge-function-contracts.md)
      supabase.realtime.setAuth(next?.access_token ?? null);
      if (next) void syncOrg(next.user.id);
      else setOrg(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [syncOrg]);

  const signInWithDemo = useCallback(async (account: DemoAccount) => {
    pendingDemo.current = account;
    const signIn = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (!signIn.error) return;
    // ローカルではメール確認が無効なので、未作成のデモアカウントはその場で作る。
    // デプロイ環境では seed 済みアカウント以外を作らせない。
    if (!import.meta.env.DEV) {
      pendingDemo.current = null;
      throw signIn.error;
    }
    const signUp = await supabase.auth.signUp({ email: account.email, password: account.password });
    if (signUp.error) {
      pendingDemo.current = null;
      throw signUp.error;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setOrg(null);
  }, []);

  const reloadOrg = useCallback(async () => {
    if (session) await syncOrg(session.user.id);
  }, [session, syncOrg]);

  const value = useMemo<AuthState>(
    () => ({ session, org, loading, signInWithDemo, signInWithEmail, signOut, reloadOrg }),
    [session, org, loading, signInWithDemo, signInWithEmail, signOut, reloadOrg],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider の内側でのみ使える");
  return ctx;
}

export { DEMO_ACCOUNTS };
