"use client";

import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabaseNavegador } from "@/lib/supabase/client";
import { mensagemErro } from "@/lib/utils";

/**
 * Upload de anexo para o Storage do Supabase.
 *
 * O caminho começa sempre com o id da filial — é o que as policies do bucket
 * usam para amarrar o arquivo a quem pode vê-lo (ver migration 0009).
 */
export function UploadArquivo({
  bucket,
  filialId,
  valor,
  aoEnviar,
  rotulo = "Anexar arquivo",
  ajuda,
  accept = "image/*,application/pdf",
}: {
  bucket: string;
  filialId: string;
  valor: string | null;
  aoEnviar: (caminho: string | null) => void;
  rotulo?: string;
  ajuda?: string;
  accept?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(arquivo: File) {
    if (arquivo.size > 10 * 1024 * 1024) {
      toast.error("O arquivo passa de 10 MB. Tire uma foto com resolução menor.");
      return;
    }

    setEnviando(true);
    try {
      const supabase = supabaseNavegador();
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "bin";
      const caminho = `${filialId}/${Date.now()}-${crypto.randomUUID()}.${extensao}`;

      const { error } = await supabase.storage.from(bucket).upload(caminho, arquivo, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) throw error;

      setNomeArquivo(arquivo.name);
      aoEnviar(caminho);
      toast.success("Anexo enviado.");
    } catch (erro) {
      toast.error(mensagemErro(erro));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!valor) return;
    try {
      const supabase = supabaseNavegador();
      await supabase.storage.from(bucket).remove([valor]);
    } catch {
      // Se a remoção falhar o arquivo fica órfão no bucket, mas o lançamento
      // não pode travar por causa disso.
    }
    setNomeArquivo(null);
    aoEnviar(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (valor) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{rotulo}</span>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--borda)] px-3 py-2.5">
          <FileText className="size-4 shrink-0 texto-suave" />
          <span className="min-w-0 flex-1 truncate text-sm">{nomeArquivo ?? "Arquivo anexado"}</span>
          <button
            type="button"
            onClick={remover}
            aria-label="Remover anexo"
            className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-areia-200 dark:hover:bg-areia-700"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{rotulo}</span>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-areia-300 px-3 py-3 transition-colors hover:border-cacau-400 hover:bg-areia-50 dark:border-areia-600 dark:hover:bg-areia-800">
        {enviando ? (
          <Loader2 className="size-4 shrink-0 animate-spin texto-suave" />
        ) : (
          <Paperclip className="size-4 shrink-0 texto-suave" />
        )}
        <span className="text-sm texto-suave">
          {enviando ? "Enviando…" : "Toque para escolher ou tirar uma foto"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={enviando}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void enviar(arquivo);
          }}
        />
      </label>

      {ajuda && <p className="text-sm texto-suave">{ajuda}</p>}
    </div>
  );
}
