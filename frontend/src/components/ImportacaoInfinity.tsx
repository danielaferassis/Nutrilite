import { Ban, FileWarning, History, RotateCcw, Send, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErroApi, apiFetch, query } from '../api';
import { useFeedback } from '../feedback';
import { formatarDataHora } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { ErroImportacao, Importacao, StatusImportacao } from '../tipos';
import PainelOEE from './PainelOEE';
import {
  Alerta,
  AreaArquivo,
  Button,
  CabecalhoCard,
  Card,
  Etiqueta,
  EtiquetaCor,
  Janela,
  PageHeader,
  Tabela,
} from './ui';

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

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Cadastros e dados"
        titulo="Importação Infinity"
        ajuda={[
          'Exporte os apontamentos de secagem do Infinity (.csv ou .xlsx) e arraste o arquivo para a área de importação.',
          'Cada secador precisa ter o código do Infinity no cadastro (Matriz de Capacidade, editar secador).',
          'Linhas repetidas são ignoradas, e se houver erro em alguma linha nada do arquivo é gravado: abra "Ver erros", corrija e envie de novo.',
          'Os indicadores no topo (OEE e aderência ao plano) usam os apontamentos importados no período escolhido.',
        ]}
        descricao="Cargas de secagem apontadas no Infinity, comparadas com o plano aprovado."
      />

      {podeVerIndicadores && <PainelOEE />}

      {podeImportar && (
        <>
          <Card>
            <CabecalhoCard
              icone={UploadCloud}
              titulo="Importar export do Infinity"
              descricao="Importe aqui o arquivo exportado do Infinity."
            />
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <AreaArquivo
                rotulo="Export do Infinity (.csv ou .xlsx)"
                aceita=".csv,.xlsx"
                arquivo={arquivo}
                aoEscolher={setArquivo}
                desabilitado={enviando}
              />
              <Button icone={Send} onClick={() => enviar()} disabled={!arquivo} carregando={enviando}>
                Enviar
              </Button>
            </div>
          </Card>

          <Card>
            <CabecalhoCard icone={History} titulo="Importações" descricao="Os 20 envios mais recentes." />
            {importacoes.erro && <Alerta>{importacoes.erro}</Alerta>}
            <Tabela
              linhas={importacoes.dados ?? []}
              chave={(i) => i.id}
              carregando={importacoes.carregando}
              vazio="Nenhum arquivo do Infinity enviado ainda."
              colunas={[
                { titulo: 'ID', valor: (i) => `#${i.id}`, texto: (i) => `#${i.id}`, ordenar: (i) => i.id },
                { titulo: 'Arquivo', valor: (i) => i.nome_arquivo, texto: (i) => i.nome_arquivo },
                {
                  titulo: 'Enviado',
                  valor: (i) => (
                    <>
                      {formatarDataHora(i.criado_em)}
                      {i.usuario && <span className="block text-xs text-suave">{i.usuario.nome}</span>}
                    </>
                  ),
                  texto: (i) => `${formatarDataHora(i.criado_em)} ${i.usuario?.nome ?? ''}`,
                  ordenar: (i) => i.criado_em,
                },
                {
                  titulo: 'Situação',
                  valor: (i) => <Etiqueta cor={COR_STATUS[i.status]}>{ROTULO_STATUS[i.status]}</Etiqueta>,
                  texto: (i) => ROTULO_STATUS[i.status],
                  filtro: 'opcoes',
                },
                { titulo: 'Resultado', valor: (i) => resultado(i), texto: (i) => resultado(i) },
              ]}
              acoes={(i) => (
                <>
                  {i.status === 'erro' && (
                    <Button variant="secondary" tamanho="sm" icone={FileWarning} compacto onClick={() => verErros(i)}>
                      Ver erros
                    </Button>
                  )}
                  {(i.status === 'erro' || i.status === 'cancelado') && i.arquivo_disponivel && (
                    <Button variant="secondary" tamanho="sm" icone={RotateCcw} compacto onClick={() => acao(i, 'reprocessar')}>
                      Reprocessar
                    </Button>
                  )}
                  {i.status === 'pendente' && (
                    <Button variant="secondary" tamanho="sm" icone={Ban} compacto onClick={() => acao(i, 'cancelar')}>
                      Cancelar
                    </Button>
                  )}
                </>
              )}
            />
          </Card>
        </>
      )}

      {erros && (
        <Janela
          titulo={`Erros da importação #${erros.id}`}
          descricao={`${erros.lista.length} linha(s) com problema. Corrija no arquivo e envie de novo.`}
          icone={FileWarning}
          aoFechar={() => setErros(null)}
        >
          <ul className="space-y-2 text-sm">
            {erros.lista.map((e, k) => (
              <li key={k} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-900">
                {e.linha !== null && (
                  <strong className="font-semibold">
                    Linha {e.linha}
                    {e.coluna ? ` (${e.coluna})` : ''}:{' '}
                  </strong>
                )}
                {e.mensagem}
              </li>
            ))}
          </ul>
        </Janela>
      )}
    </div>
  );
}
