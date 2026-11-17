import { Check, CircleAlert, LucideIcon, X } from 'lucide-react';
import { ReactNode, useEffect, useId } from 'react';

import { Button } from './Button';

export type ModalTipo = 'sucesso' | 'erro' | 'confirmacao';

const ICONES: Record<ModalTipo, { cor: string; Icone: LucideIcon }> = {
  sucesso: { cor: 'bg-verde-100 text-verde-700', Icone: Check },
  erro: { cor: 'bg-red-100 text-red-700', Icone: X },
  confirmacao: { cor: 'bg-amber-100 text-amber-700', Icone: CircleAlert },
};

export interface ModalProps {
  tipo: ModalTipo;
  titulo: string;
  mensagem?: ReactNode;
  /** Texto do botão principal (padrão: OK). */
  rotuloConfirmar?: string;
  /** Mostra o botão Cancelar (usado nas confirmações). */
  rotuloCancelar?: string;
  /** Botão principal vermelho, para ações destrutivas. */
  perigo?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

/** Janela sobre a página que exige uma resposta do usuário. Esc ou clique fora cancelam. */
export const Modal = ({
  tipo,
  titulo,
  mensagem,
  rotuloConfirmar = 'OK',
  rotuloCancelar,
  perigo = false,
  aoConfirmar,
  aoCancelar,
}: ModalProps) => {
  const tituloId = useId();
  const mensagemId = useId();
  const icone = ICONES[tipo];

  useEffect(() => {
    // Em confirmação destrutiva o foco vai no Cancelar: Enter por engano não exclui nada
    const alvo = perigo && rotuloCancelar ? 'cancelar' : 'confirmar';
    document.getElementById(`${tituloId}-${alvo}`)?.focus();

    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoCancelar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoCancelar, perigo, rotuloCancelar, tituloId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 backdrop-blur-[2px] p-4 animate-entra"
      onMouseDown={(e) => e.target === e.currentTarget && aoCancelar()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={mensagem ? mensagemId : undefined}
        className="w-full max-w-md rounded-2xl border border-borda bg-white p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${icone.cor}`}>
            <icone.Icone aria-hidden="true" className="size-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="text-lg font-semibold text-tinta">{titulo}</h2>
            {mensagem && (
              <div id={mensagemId} className="mt-2 whitespace-pre-line break-words text-sm text-suave">
                {mensagem}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {rotuloCancelar && (
            <Button id={`${tituloId}-cancelar`} variant="secondary" onClick={aoCancelar}>
              {rotuloCancelar}
            </Button>
          )}
          <Button id={`${tituloId}-confirmar`} variant={perigo ? 'danger' : 'primary'} onClick={aoConfirmar}>
            {rotuloConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
};
