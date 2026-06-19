import { ReactNode } from "react";

// Padrão mobile reaproveitável.
// Renderiza uma faixa horizontal de chips redondos com scroll quando estoura.
// Use para qualquer filtro mobile de 1 nível (status, tipo, etiqueta etc.).
//
// Exemplos futuros: filtros em /app/contatos, /app/agendamentos, /app/campanhas.

export interface MobileChipOption<T extends string> {
  value: T;
  label: string;
  trailing?: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<MobileChipOption<T>>;
  className?: string;
  ariaLabel?: string;
}

export function MobileFilterChips<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 ${className ?? ""}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`shrink-0 inline-flex items-center gap-1 text-xs px-3 h-7 rounded-full border transition ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
            } ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span>{opt.label}</span>
            {opt.trailing}
          </button>
        );
      })}
    </div>
  );
}
