import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_master: boolean;
  global_role: "master" | "user";
  must_change_password?: boolean;
  signature?: string | null;
  signature_enabled?: boolean;
  public_name?: string | null;
}

export interface CompanyMembership {
  id: string;
  company_id: string;
  role: "owner" | "admin" | "manager" | "agent" | "financial";
  status: "active" | "pending" | "disabled";
  company: { id: string; name: string; status: string } | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: ProfileInfo | null;
  memberships: CompanyMembership[];
  loading: boolean;
  refresh: (uid?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (uid: string) => {
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase
        .from("company_users")
        .select("id, company_id, role, status, company:companies(id, name, status)")
        .eq("user_id", uid)
        .eq("status", "active"),
    ]);
    setProfile((p as unknown as ProfileInfo | null) ?? null);
    setMemberships((m as CompanyMembership[] | null) ?? []);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const prevUid = user?.id ?? null;
      const nextUid = newSession?.user?.id ?? null;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setProfile(null);
        setMemberships([]);
        setLoading(false);
        return;
      }
      // Only flip global loading (which unmounts protected routes) on a real
      // user change. Token refresh / window-focus events keep the same uid and
      // must NOT unmount the page — that's what was closing the open ticket.
      if (prevUid !== nextUid) {
        setLoading(true);
        setTimeout(() => {
          void loadUserData(newSession.user.id).finally(() => setLoading(false));
        }, 0);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadUserData(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async (uid?: string) => {
    const targetUid = uid ?? user?.id;
    if (targetUid) await loadUserData(targetUid);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({ user, session, profile, memberships, loading, refresh, signOut }),
    [user, session, profile, memberships, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
