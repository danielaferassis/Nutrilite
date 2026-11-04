import { ReactNode, useEffect, useId } from 'react';

import { Button } from './Button';

export type ModalTipo = 'sucesso' | 'erro' | 'confirmacao';

const ICONES: Record<ModalTipo, { cor: string; caminho: ReactNode }> = {
  sucesso: {
    cor: 'bg-green-100 text-[#006F44]',
    caminho: <path d="M5 13l4 4L19 7" />,
  },
  erro: {
    cor: 'bg-red-100 text-red-700',
    caminho: <path d="M6 6l12 12M18 6L6 18" />,
  },
  confirmacao: {
    cor: 'bg-amber-100 text-amber-700',
    caminho: <path d="M12 8v5m0 3.5v.01" />,
  },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && aoCancelar()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={mensagem ? mensagemId : undefined}
        className="w-full max-w-md rounded-lg bg-[#FFFFFF] p-6 shadow-xl"
      >
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${icone.cor}`}>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icone.caminho}
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="text-lg font-semibold text-[#211E16]">{titulo}</h2>
            {mensagem && (
              <div id={mensagemId} className="mt-2 whitespace-pre-line break-words text-sm text-gray-600">
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
