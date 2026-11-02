import { FormEvent, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { DIAS_SEMANA, ROTULO_STATUS, formatarData, formatarDataHora, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { PlanoDetalhe, PlanoResumo, ResultadoSimulacao, StatusPlano } from '../tipos';
import ItemList from './ItemList';
import ResultadoPlano from './ResultadoPlano';
import { Alerta, Button, Card, Etiqueta, EtiquetaCor, Input } from './ui';

const COR_STATUS: Record<StatusPlano, EtiquetaCor> = {
  rascunho: 'cinza',
  aprovado: 'verde',
  substituido: 'amarelo',
};

export default function PlanoSecagem() {
  const { pode } = useSessao();
  const podeSimular = pode('plano.simular');
  const podeAprovar = pode('plano.aprovar');

  const [inicio, setInicio] = useState(hojeIso());
  const [fim, setFim] = useState(hojeIso(6));
  // Começa vazio de propósito: dia de operação não informado vira PARAM_AUSENTE, sem supor nada
  const [dias, setDias] = useState<number[]>([]);
  const [observacao, setObservacao] = useState('');

  const [simulacao, setSimulacao] = useState<ResultadoSimulacao | null>(null);
  const [plano, setPlano] = useState<PlanoDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const planos = useApi<PlanoResumo[]>('/planos');

  const pedido = () => ({ inicio, fim, dias_operacao: dias.length ? dias : null });

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro('');
    setMensagem('');
    try {
      await acao();
    } catch (err) {
      setErro(textoDoErro(err));
    } finally {
      setOcupado(false);
    }
  };

  const simular = (e: FormEvent) => {
    e.preventDefault();
    executar(async () => {
      setPlano(null);
      setSimulacao(await apiFetch<ResultadoSimulacao>('/simulacoes', {
        method: 'POST',
        body: JSON.stringify(pedido()),
      }));
    });
  };

  const salvar = () =>
    executar(async () => {
      const salvo = await apiFetch<PlanoDetalhe>('/planos', {
        method: 'POST',
        body: JSON.stringify({ ...pedido(), observacao: observacao.trim() || null }),
      });
      logger.info(`Plano ${salvo.id} salvo`);
      setSimulacao(null);
      setPlano(salvo);
      setMensagem(`Plano v${salvo.versao} salvo como rascunho.`);
      planos.recarregar();
    });

  const abrir = (id: number) =>
    executar(async () => {
      setSimulacao(null);
      setPlano(await apiFetch<PlanoDetalhe>(`/planos/${id}`));
    });

  const aprovar = (p: PlanoResumo) => {
    if (!window.confirm(`Aprovar o plano v${p.versao}? Aprovados sobrepostos passam a "substituído".`)) return;
    executar(async () => {
      setPlano(await apiFetch<PlanoDetalhe>(`/planos/${p.id}/aprovar`, { method: 'POST' }));
      setMensagem(`Plano v${p.versao} aprovado.`);
      planos.recarregar();
    });
  };

  const excluir = (p: PlanoResumo) => {
    if (!window.confirm(`Excluir o rascunho v${p.versao}?`)) return;
    executar(async () => {
      await apiFetch(`/planos/${p.id}`, { method: 'DELETE' });
      if (plano?.id === p.id) setPlano(null);
      planos.recarregar();
    });
  };

  const alternarDia = (dia: number) =>
    setDias(dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort());

  const linhas = (planos.dados ?? []).map((p) => ({
    versao: `v${p.versao}`,
    horizonte: `${formatarData(p.inicio)} a ${formatarData(p.fim)}`,
    status: <Etiqueta cor={COR_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Etiqueta>,
    viavel: p.viavel ? 'Sim' : 'Não',
    criado: `${p.criado_por.nome}, ${formatarDataHora(p.criado_em)}`,
    aprovado: p.aprovado_por ? `${p.aprovado_por.nome}, ${formatarDataHora(p.aprovado_em!)}` : '—',
    acoes: (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => abrir(p.id)}>Ver</Button>
        {podeAprovar && p.status === 'rascunho' && <Button onClick={() => aprovar(p)}>Aprovar</Button>}
        {podeSimular && p.status === 'rascunho' && (
          <Button variant="secondary" onClick={() => excluir(p)}>Excluir</Button>
        )}
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Plano de Secagem</h1>
        <p className="text-sm text-gray-500">
          Cruza demandas, previsões e capacidade dos secadores e aponta conflitos antes de a erva chegar.
        </p>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}

      {podeSimular && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Simular</h2>
          <form onSubmit={simular} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Início" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
              <Input label="Fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} required />
              <Input label="Observação (ao salvar)" maxLength={500} value={observacao}
                onChange={(e) => setObservacao(e.target.value)} />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-[#211E16] mb-2">Dias de operação da fábrica</legend>
              <div className="flex flex-wrap gap-4">
                {DIAS_SEMANA.map((rotulo, dia) => (
                  <label key={dia} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={dias.includes(dia)} onChange={() => alternarDia(dia)} />
                    {rotulo}
                  </label>
                ))}
              </div>
              {dias.length === 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  Nenhum dia marcado: a simulação vai apontar o calendário como parâmetro ausente.
                </p>
              )}
            </fieldset>
            <div className="flex gap-3 justify-end">
              <Button type="submit" variant="secondary" disabled={ocupado}>Simular</Button>
              <Button type="button" onClick={salvar} disabled={ocupado}>Simular e salvar rascunho</Button>
            </div>
          </form>
        </Card>
      )}

      {simulacao && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Resultado da simulação (não salvo)</h2>
          <ResultadoPlano resultado={simulacao} />
        </div>
      )}

      {plano && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Plano v{plano.versao}</h2>
            <Etiqueta cor={COR_STATUS[plano.status]}>{ROTULO_STATUS[plano.status]}</Etiqueta>
          </div>
          <p className="text-sm text-gray-600">
            Criado por {plano.criado_por.nome} em {formatarDataHora(plano.criado_em)}
            {plano.aprovado_por && ` · aprovado por ${plano.aprovado_por.nome} em ${formatarDataHora(plano.aprovado_em!)}`}
            {' · dias de operação: '}
            {plano.parametros.dias_operacao?.map((d) => DIAS_SEMANA[d]).join(', ') ?? 'não informados'}
            {plano.observacao && ` · ${plano.observacao}`}
          </p>
          <ResultadoPlano resultado={plano} />
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-4">Planos salvos</h2>
        {planos.erro && <Alerta>{planos.erro}</Alerta>}
        <ItemList
          colunas={['Versão', 'Horizonte', 'Status', 'Viável', 'Criado', 'Aprovado', '']}
          dados={linhas}
          vazio={planos.carregando ? 'Carregando…' : 'Nenhum plano salvo.'}
        />
      </Card>
    </div>
  );
}
