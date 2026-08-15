import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const CONTROLE =
  "w-full rounded-lg border border-areia-300 bg-[var(--superficie)] px-3 py-2.5 " +
  "text-[var(--texto)] placeholder:text-areia-400 transition-colors " +
  "focus:border-cacau-600 focus:outline-2 focus:outline-offset-0 focus:outline-cacau-600/30 " +
  "disabled:bg-areia-100 disabled:text-areia-500 dark:border-areia-700 dark:disabled:bg-areia-800 " +
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:outline-red-600/30";

interface CampoBase {
  rotulo?: ReactNode;
  ajuda?: ReactNode;
  erro?: string | null;
  obrigatorio?: boolean;
}

function Envolver({
  id,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  className,
  children,
}: CampoBase & { id?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rotulo && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--texto)]">
          {rotulo}
          {obrigatorio && (
            <span className="ml-0.5 text-red-600" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {erro ? (
        <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>
      ) : (
        ajuda && <p className="text-sm texto-suave">{ajuda}</p>
      )}
    </div>
  );
}

export function Campo({
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  className,
  id,
  ...props
}: CampoBase & ComponentProps<"input">) {
  return (
    <Envolver
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        required={obrigatorio}
        {...props}
        className={cn(CONTROLE, props.type === "number" && "tabular")}
      />
    </Envolver>
  );
}

export function Area({
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  className,
  id,
  ...props
}: CampoBase & ComponentProps<"textarea">) {
  return (
    <Envolver
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      <textarea
        id={id}
        aria-invalid={erro ? true : undefined}
        required={obrigatorio}
        rows={3}
        {...props}
        className={cn(CONTROLE, "resize-y")}
      />
    </Envolver>
  );
}

export function Selecao({
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  className,
  id,
  children,
  ...props
}: CampoBase & ComponentProps<"select">) {
  return (
    <Envolver
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      <select
        id={id}
        aria-invalid={erro ? true : undefined}
        required={obrigatorio}
        {...props}
        className={cn(CONTROLE, "appearance-none bg-no-repeat pr-9")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B6357' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: "right 0.6rem center",
          backgroundSize: "1.1rem",
        }}
      >
        {children}
      </select>
    </Envolver>
  );
}

export function Checkbox({
  rotulo,
  ajuda,
  className,
  id,
  ...props
}: { rotulo: ReactNode; ajuda?: ReactNode } & ComponentProps<"input">) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        {...props}
        className="mt-0.5 size-5 shrink-0 rounded border-areia-300 accent-cacau-700"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium">
          {rotulo}
        </label>
        {ajuda && <span className="text-sm texto-suave">{ajuda}</span>}
      </div>
    </div>
  );
}
