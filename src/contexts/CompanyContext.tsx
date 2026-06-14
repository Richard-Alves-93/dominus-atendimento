import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type CompanyMembership } from "@/contexts/AuthContext";

const STORAGE_KEY = "dominus.activeCompanyId";

interface CompanyContextValue {
  activeCompanyId: string | null;
  activeMembership: CompanyMembership | null;
  setActiveCompanyId: (id: string | null) => void;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { memberships } = useAuth();
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );

  useEffect(() => {
    if (memberships.length === 0) return;
    const stillValid = memberships.some((m) => m.company_id === activeCompanyId);
    if (!stillValid) {
      const next = memberships[0].company_id;
      setActiveCompanyIdState(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, [memberships, activeCompanyId]);

  const setActiveCompanyId = (id: string | null) => {
    setActiveCompanyIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const activeMembership = useMemo(
    () => memberships.find((m) => m.company_id === activeCompanyId) ?? null,
    [memberships, activeCompanyId],
  );

  return (
    <CompanyContext.Provider value={{ activeCompanyId, activeMembership, setActiveCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
