import { useEffect, useState } from 'react';

import { ErroApi, apiFetch, query } from '../api';
import { useFeedback } from '../feedback';
import { formatarDataHora } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { ErroImportacao, Importacao, StatusImportacao } from '../tipos';
import ItemList from './ItemList';
import PainelOEE from './PainelOEE';
import { Alerta, Button, Card, Etiqueta, EtiquetaCor, PageHeader } from './ui';

const TIPO = 'infinity_csv';
// Enquanto alguma importação estiver na fila, a lista se atualiza sozinha
const INTERVALO_ATUALIZACAO_MS = 2000;

const ROTULO_STATUS: Record<StatusImportacao, string> = {
  pendente: 'Na fila',
  processando: 'Processando',
  concluido: 'Concluída',
  erro: 'Com erro',
  cancelado: 'Cancelada',
};
const COR_STATUS: Record<StatusImportacao, EtiquetaCor> = {
  pendente: 'cinza',
  processando: 'azul',
  concluido: 'verde',
  erro: 'vermelho',
  cancelado: 'amarelo',
};

const resultado = (i: Importacao) => {
  if (i.status === 'concluido') {
    const ignoradas = i.linhas_ignoradas ?? 0;
    const gravadas = (i.linhas_total ?? 0) - ignoradas;
    return `${gravadas} apontamento(s) gravado(s)` + (ignoradas ? `, ${ignoradas} duplicado(s) ignorado(s)` : '');
  }
  return i.mensagem_erro ?? '—';
};

export default function ImportacaoInfinity() {
  const { pode } = useSessao();
  const podeImportar = pode('relatorio.importacao');
  const feedback = useFeedback();

  const importacoes = useApi<Importacao[]>(podeImportar ? `/importacoes${query({ tipo: TIPO, limite: 20 })}` : null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Erros da importação aberta (id → lista)
  const [erros, setErros] = useState<{ id: number; lista: ErroImportacao[] } | null>(null);

  const emAndamento = (importacoes.dados ?? []).some((i) => i.status === 'pendente' || i.status === 'processando');
  useEffect(() => {
    if (!emAndamento) return;
    const timer = setInterval(importacoes.recarregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(timer);
  }, [emAndamento, importacoes.recarregar]);

  const enviar = async (forcar = false) => {
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    dados.append('tipo', TIPO);
    if (forcar) dados.append('forcar', 'true');
    setEnviando(true);
    try {
      const nova = await apiFetch<Importacao>('/importacoes', { method: 'POST', body: dados });
      logger.info(`Importação ${nova.id} do Infinity enviada`);
      setArquivo(null);
      importacoes.recarregar();
      feedback.sucesso('Arquivo enviado', `A importação #${nova.id} entrou na fila. O resultado aparece na lista abaixo.`);
    } catch (err) {
      // Mesmo arquivo de antes: pergunta se é para enviar de novo (as linhas repetidas são ignoradas)
      if (err instanceof ErroApi && err.status === 409 && !forcar) {
        const ok = await feedback.confirmar({
          titulo: 'Arquivo já enviado',
          mensagem: `${err.message}\n\nEnviar de novo? Os apontamentos que já existem são ignorados, nada é duplicado.`,
          rotuloConfirmar: 'Enviar de novo',
        });
        if (ok) await enviar(true);
      } else {
        feedback.erro('Não foi possível enviar o arquivo', err);
      }
    } finally {
      setEnviando(false);
    }
  };

  const verErros = async (i: Importacao) => {
    try {
      setErros({ id: i.id, lista: await apiFetch<ErroImportacao[]>(`/importacoes/${i.id}/erros`) });
    } catch (err) {
      feedback.erro('Não foi possível carregar os erros', err);
    }
  };

  const acao = async (i: Importacao, caminho: 'reprocessar' | 'cancelar') => {
    try {
      await apiFetch(`/importacoes/${i.id}/${caminho}`, { method: 'POST' });
      importacoes.recarregar();
    } catch (err) {
      feedback.erro(caminho === 'reprocessar' ? 'Não foi possível reprocessar' : 'Não foi possível cancelar', err);
    }
  };

  // O painel é leitura: também quem acompanha os planos vê (o backend confere o mesmo)
  const podeVerIndicadores = podeImportar || pode('plano.consultar', 'plano.simular', 'plano.aprovar');
  if (!podeImportar && !podeVerIndicadores) {
    return <Alerta>Seu perfil não tem acesso à importação do Infinity.</Alerta>;
  }

  const linhas = (importacoes.dados ?? []).map((i) => ({
    id: `#${i.id}`,
    arquivo: i.nome_arquivo,
    enviado: `${formatarDataHora(i.criado_em)}${i.usuario ? ` · ${i.usuario.nome}` : ''}`,
    status: <Etiqueta cor={COR_STATUS[i.status]}>{ROTULO_STATUS[i.status]}</Etiqueta>,
    resultado: resultado(i),
    acoes: (
      <div className="flex gap-2">
        {i.status === 'erro' && <Button variant="secondary" onClick={() => verErros(i)}>Ver erros</Button>}
        {(i.status === 'erro' || i.status === 'cancelado') && i.arquivo_disponivel && (
          <Button variant="secondary" onClick={() => acao(i, 'reprocessar')}>Reprocessar</Button>
        )}
        {i.status === 'pendente' && <Button variant="secondary" onClick={() => acao(i, 'cancelar')}>Cancelar</Button>}
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Cadastros e dados"
        titulo="Importação Infinity"
        descricao="Apontamentos de secagem exportados do Infinity: cada linha é uma carga de um secador. Eles alimentam os indicadores de OEE e a aderência ao plano."
      />

      {podeVerIndicadores && <PainelOEE />}

      {podeImportar && (
        <>
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
              <label className="block text-sm">
                <span className="font-medium text-tinta">Export do Infinity (.csv ou .xlsx)</span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  aria-label="Export do Infinity"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button variant="primary" onClick={() => enviar()} disabled={!arquivo || enviando}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
            <p className="text-xs text-suave mt-3">
              Cada secador precisa ter o <strong>código no Infinity</strong> (texto da coluna Processo) informado no
              cadastro, em Matriz de Capacidade. Linhas repetidas, no arquivo ou já importadas, são ignoradas. Com
              qualquer erro de linha, nada do arquivo é gravado.
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Importações</h2>
            {importacoes.erro && <Alerta>{importacoes.erro}</Alerta>}
            <ItemList
              colunas={['ID', 'Arquivo', 'Enviado', 'Situação', 'Resultado', '']}
              dados={linhas}
              carregando={importacoes.carregando}
              vazio="Nenhum arquivo do Infinity enviado ainda."
            />
            {erros && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Erros da importação #{erros.id}</h3>
                  <Button variant="secondary" onClick={() => setErros(null)}>Fechar</Button>
                </div>
                <ul className="text-sm list-disc pl-5 max-h-64 overflow-auto">
                  {erros.lista.map((e, k) => (
                    <li key={k}>
                      {e.linha !== null && <>Linha {e.linha}{e.coluna ? ` (${e.coluna})` : ''}: </>}
                      {e.mensagem}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
