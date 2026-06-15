import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type CompanyMembership } from "@/contexts/AuthContext";

const STORAGE_KEY = "dominus.activeCompanyId";
const IMPERSONATION_KEY = "dominus.masterImpersonation";
const IMPERSONATION_NAME_KEY = "dominus.impersonatedCompanyName";

interface CompanyContextValue {
  activeCompanyId: string | null;
  activeMembership: CompanyMembership | null;
  setActiveCompanyId: (id: string | null) => void;
  isImpersonating: boolean;
  impersonatedCompanyName: string | null;
  startImpersonation: (companyId: string, companyName: string) => void;
  stopImpersonation: (opts?: { clearActive?: boolean }) => void;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { memberships, profile } = useAuth();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";

  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [isImpersonating, setIsImpersonating] = useState<boolean>(() =>
    typeof window !== "undefined" ? localStorage.getItem(IMPERSONATION_KEY) === "true" : false,
  );
  const [impersonatedCompanyName, setImpersonatedCompanyName] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(IMPERSONATION_NAME_KEY) : null,
  );

  useEffect(() => {
    // Only enforce membership for non-master users
    if (isMaster) return;
    if (memberships.length === 0) return;
    const stillValid = memberships.some((m) => m.company_id === activeCompanyId);
    if (!stillValid) {
      const next = memberships[0].company_id;
      setActiveCompanyIdState(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, [memberships, activeCompanyId, isMaster]);

  const setActiveCompanyId = (id: string | null) => {
    setActiveCompanyIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const startImpersonation = (companyId: string, companyName: string) => {
    setActiveCompanyIdState(companyId);
    localStorage.setItem(STORAGE_KEY, companyId);
    localStorage.setItem(IMPERSONATION_KEY, "true");
    localStorage.setItem(IMPERSONATION_NAME_KEY, companyName);
    setIsImpersonating(true);
    setImpersonatedCompanyName(companyName);
  };

  const stopImpersonation = (opts?: { clearActive?: boolean }) => {
    localStorage.removeItem(IMPERSONATION_KEY);
    localStorage.removeItem(IMPERSONATION_NAME_KEY);
    setIsImpersonating(false);
    setImpersonatedCompanyName(null);
    if (opts?.clearActive) {
      localStorage.removeItem(STORAGE_KEY);
      setActiveCompanyIdState(null);
    }
  };

  const activeMembership = useMemo(
    () => memberships.find((m) => m.company_id === activeCompanyId) ?? null,
    [memberships, activeCompanyId],
  );

  return (
    <CompanyContext.Provider
      value={{
        activeCompanyId,
        activeMembership,
        setActiveCompanyId,
        isImpersonating,
        impersonatedCompanyName,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
