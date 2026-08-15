"use client";

import {
  ArrowLeftRight,
  ClipboardCheck,
  Clock,
  Coffee,
  FileBarChart,
  LayoutDashboard,
  ListTodo,
  Package,
  PackageSearch,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NomeIconeNavegacao } from "@/lib/navegacao";

/**
 * Resolve o nome do ícone (que viaja do servidor como texto) para o componente.
 * Vive no cliente porque componente de ícone é função — e função não atravessa
 * a fronteira servidor→cliente como prop.
 */
export const ICONES_NAVEGACAO: Record<NomeIconeNavegacao, LucideIcon> = {
  painel: LayoutDashboard,
  estoque: PackageSearch,
  produtos: Package,
  transferencias: ArrowLeftRight,
  inventario: ClipboardCheck,
  atividades: ListTodo,
  cafeteria: Coffee,
  relatorios: FileBarChart,
  ponto: Clock,
  configuracoes: Settings,
};
