import { useState } from 'react';

import { apiFetch } from '../api';
import { useFeedback } from '../feedback';
import { ROTULO_ORIGEM, formatarData, formatarKg } from '../formatar';
import { logger } from '../logger';
import { Erva, ImportacaoPrevisoes as Resultado, LinhaImportacaoPrevisao, Origem } from '../tipos';
import { Alerta, Button, Etiqueta, Select } from './ui';

interface Escolhas {
  aba: string;
  erva_id: string;
  origem: Origem;
}

const formulario = (arquivo: File, escolhas: Partial<Escolhas>) => {
  const dados = new FormData();
  dados.append('arquivo', arquivo);
  Object.entries(escolhas).forEach(([campo, valor]) => {
    if (valor) dados.append(campo, valor);
  });
  return dados;
};

function Lista({ titulo, linhas, kg }: { titulo: string; linhas: LinhaImportacaoPrevisao[]; kg: (l: LinhaImportacaoPrevisao) => string }) {
  if (linhas.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">{titulo} ({linhas.length})</summary>
      <ul className="mt-1 max-h-40 overflow-auto pl-4 text-suave">
        {linhas.map((l) => (
          <li key={`${l.talhao}-${l.data_chegada}`}>
            {formatarData(l.data_chegada)} · {l.talhao} · {kg(l)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Importa a planilha "Programação Produção Ervas" (uma aba por erva, colunas por talhão).
 * Primeiro mostra a prévia (nada gravado); a confirmação sincroniza as previsões da aba.
 */
export default function ImportacaoPrevisoes({ ervas, aoImportar }: { ervas: Erva[]; aoImportar: () => void }) {
  const feedback = useFeedback();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [escolhas, setEscolhas] = useState<Escolhas>({ aba: '', erva_id: '', origem: 'fazenda_propria' });
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const verPrevia = async (doArquivo: File, novas: Partial<Escolhas>) => {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await apiFetch<Resultado>('/previsoes/importacao/previa', {
        method: 'POST',
        body: formulario(doArquivo, novas),
      });
      setPrevia(resposta);
      setEscolhas({ aba: resposta.aba, erva_id: resposta.erva_id ? String(resposta.erva_id) : '', origem: resposta.origem });
    } catch (err) {
      setPrevia(null);
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  };

  const escolherArquivo = (novo: File | null) => {
    setArquivo(novo);
    setPrevia(null);
    // Arquivo novo: a aba e a erva vêm da sugestão do servidor
    if (novo) verPrevia(novo, { origem: escolhas.origem });
  };

  const mudar = (campo: keyof Escolhas) => (e: { target: { value: string } }) => {
    const novas = { ...escolhas, [campo]: e.target.value };
    // Outra aba: deixa o servidor sugerir a erva dela
    if (campo === 'aba') novas.erva_id = '';
    setEscolhas(novas);
    if (arquivo) verPrevia(arquivo, novas);
  };

  const limpar = () => {
    setArquivo(null);
    setPrevia(null);
    setErro(null);
  };

  const mudancas = previa ? previa.criar.length + previa.alterar.length + previa.remover.length : 0;
  const podeConfirmar = !!previa && !!arquivo && !!escolhas.erva_id && previa.erros.length === 0 && mudancas > 0;

  const confirmar = async () => {
    if (!previa || !arquivo) return;
    const erva = ervas.find((e) => String(e.id) === escolhas.erva_id)?.nome ?? 'erva';
    const ok = await feedback.confirmar({
      titulo: 'Importar previsões?',
      mensagem:
        `${erva} · ${ROTULO_ORIGEM[escolhas.origem]} · aba "${previa.aba}".\n\n` +
        `Criar ${previa.criar.length}, alterar ${previa.alterar.length} e remover ${previa.remover.length} previsão(ões).`,
      rotuloConfirmar: 'Importar',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const resultado = await apiFetch<Resultado>('/previsoes/importacao', {
        method: 'POST',
        body: formulario(arquivo, escolhas),
      });
      logger.info(`Planilha importada: aba ${resultado.aba}, ${resultado.criar.length} criadas`);
      limpar();
      aoImportar();
      feedback.sucesso(
        'Previsões importadas',
        `${resultado.criar.length} criada(s), ${resultado.alterar.length} alterada(s) e ${resultado.remover.length} removida(s). Elas já entram nas próximas simulações.`
      );
    } catch (err) {
      feedback.erro('Não foi possível importar a planilha', err);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Importar planilha de programação</h3>
        <p className="text-sm text-suave">
          Planilha da fazenda (.xlsx), uma aba por erva e uma coluna por talhão. Você vê o que muda antes de confirmar.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-tinta">Arquivo</span>
        <input
          type="file"
          accept=".xlsx"
          aria-label="Arquivo"
          className="mt-1 block w-full text-sm"
          onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
        />
      </label>

      {erro && <Alerta>{erro}</Alerta>}

      {previa && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select id="importacao-aba" label="Aba" value={escolhas.aba} onChange={mudar('aba')} disabled={ocupado}>
              {previa.abas.map((aba) => <option key={aba} value={aba}>{aba}</option>)}
            </Select>
            <Select id="importacao-erva" label="Erva" value={escolhas.erva_id} onChange={mudar('erva_id')} disabled={ocupado}>
              <option value="">Escolha…</option>
              {ervas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
            <Select id="importacao-origem" label="Origem" value={escolhas.origem} onChange={mudar('origem')} disabled={ocupado}>
              {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </Select>
          </div>

          <p className="text-sm text-suave">
            {previa.erva_na_planilha && <>Na planilha: <strong>{previa.erva_na_planilha}</strong> · </>}
            {previa.talhoes.length} talhão(ões)
            {previa.de && previa.ate && <> · {formatarData(previa.de)} a {formatarData(previa.ate)}</>}
            {' '}· {formatarKg(previa.total_kg)} previstos
          </p>

          {previa.erros.length > 0 && (
            <Alerta>
              A planilha tem {previa.erros.length} erro(s); nada será gravado até corrigir:
              <ul className="mt-1 list-disc pl-5">
                {previa.erros.slice(0, 10).map((e, i) => (
                  <li key={i}>{e.coluna}{e.linha}: {e.mensagem}</li>
                ))}
                {previa.erros.length > 10 && <li>… e mais {previa.erros.length - 10}</li>}
              </ul>
            </Alerta>
          )}

          {previa.avisos.map((aviso) => (
            <p key={aviso} className="text-sm text-amber-700">{aviso}</p>
          ))}

          {previa.erva_id && previa.erros.length === 0 && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-2">
                <Etiqueta cor="verde">Criar: {previa.criar.length}</Etiqueta>
                <Etiqueta cor="azul">Alterar: {previa.alterar.length}</Etiqueta>
                <Etiqueta cor="vermelho">Remover: {previa.remover.length}</Etiqueta>
              </div>
              {mudancas === 0 && <p className="text-sm text-suave">Nada muda: as previsões já estão iguais à planilha.</p>}
              <Lista titulo="Criar" linhas={previa.criar} kg={(l) => formatarKg(l.kg_fresco!)} />
              <Lista titulo="Alterar" linhas={previa.alterar} kg={(l) => `${formatarKg(l.kg_atual!)} → ${formatarKg(l.kg_fresco!)}`} />
              <Lista titulo="Remover" linhas={previa.remover} kg={(l) => formatarKg(l.kg_atual!)} />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={limpar} disabled={ocupado}>Cancelar</Button>
            <Button variant="primary" onClick={confirmar} disabled={!podeConfirmar || ocupado}>
              Confirmar importação
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
