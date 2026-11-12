import { ROTULO_ESTAGIO, ROTULO_PENDENCIA, formatarData, formatarHoras, formatarKg, formatarNumero } from '../formatar';
import { baixarCsv, dataCsv, gerarCsv, numeroCsv } from '../exportar';
import { Alocacao, Necessidade, ResultadoSimulacao, TipoPendencia } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Etiqueta, EtiquetaCor } from './ui';

// Mesma folga do motor para comparar kg em ponto flutuante
const FOLGA_KG = 1e-6;

const COR_PENDENCIA: Record<TipoPendencia, EtiquetaCor> = {
  param_ausente: 'amarelo',
  capacidade_excedida: 'vermelho',
  atraso: 'vermelho',
  saldo_nao_alocado: 'azul',
};

/** Cronograma: uma linha por dia, uma coluna por secador. */
export function Cronograma({ alocacoes }: { alocacoes: Alocacao[] }) {
  const secadores = [...new Set(alocacoes.map((a) => a.secador))].sort();
  const dias = [...new Set(alocacoes.map((a) => a.dia))].sort();
  // Pode haver mais de uma erva no dia (troca no mesmo dia), cada uma com várias
  // linhas (lotes/demandas). A ordem das linhas é a ordem em que entraram.
  const celula = (dia: string, secador: string) => {
    const doDia = alocacoes.filter((a) => a.dia === dia && a.secador === secador);
    if (doDia.length === 0) return <span className="text-gray-400">livre</span>;
    const ervas = [...new Set(doDia.map((a) => a.erva))];
    return (
      <div className="space-y-1">
        {ervas.map((erva, i) => {
          const daErva = doDia.filter((a) => a.erva === erva);
          const kg = daErva.reduce((soma, a) => soma + a.kg_fresco, 0);
          const horas = daErva.reduce((soma, a) => soma + a.horas_secagem + a.horas_setup, 0);
          return (
            <div key={erva} className={i > 0 ? 'pt-1 border-t border-dashed border-[#C7C8CA]' : ''}>
              <div className="font-semibold text-[#006F44]">{i > 0 && '↳ '}{erva}</div>
              <div className="text-xs text-gray-600">{formatarKg(kg)} · {formatarHoras(horas)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  if (alocacoes.length === 0) return <p className="text-sm text-gray-500">Nenhuma alocação.</p>;
  return (
    <ItemList
      colunas={['Dia', ...secadores]}
      dados={dias.map((dia) => ({
        dia: formatarData(dia),
        ...Object.fromEntries(secadores.map((s) => [s, celula(dia, s)])),
      }))}
    />
  );
}

type Situacao = 'coberta' | 'atraso' | 'proximo_plano';

const SITUACAO: Record<Situacao, { rotulo: string; cor: EtiquetaCor }> = {
  coberta: { rotulo: 'Coberta', cor: 'verde' },
  atraso: { rotulo: 'Atraso', cor: 'vermelho' },
  // Prazo depois do fim: o próximo plano ainda pode cobrir, não é atraso
  proximo_plano: { rotulo: 'Continua no próximo plano', cor: 'cinza' },
};

/**
 * @param nomeArquivo base do nome dos CSV exportados (ex.: "plano-v3"); o período é acrescentado.
 */
export default function ResultadoPlano({
  resultado,
  nomeArquivo = 'simulacao',
}: {
  resultado: ResultadoSimulacao;
  nomeArquivo?: string;
}) {
  const { kpis } = resultado;
  const ocupacao = kpis.ocupacao_planejada_pct ?? {};
  const aCobrirDepois = Object.entries(kpis.a_cobrir_apos_horizonte_kg ?? {});

  // Kg secos destinados a cada demanda no plano
  const coberto: Record<string, number> = {};
  resultado.alocacoes.forEach((a) => {
    if (a.demanda_id) coberto[a.demanda_id] = (coberto[a.demanda_id] ?? 0) + a.kg_fresco;
  });
  const falta = (demandaId: string, necessario: number) => Math.max(0, necessario - (coberto[demandaId] ?? 0));
  const situacao = (n: Necessidade): Situacao => {
    if (falta(n.demanda_id, n.kg_fresco) < FOLGA_KG) return 'coberta';
    return n.prazo > resultado.fim ? 'proximo_plano' : 'atraso';
  };

  const periodo = `${resultado.inicio}_a_${resultado.fim}`;
  const exportarCronograma = () =>
    baixarCsv(
      `${nomeArquivo}_cronograma_${periodo}.csv`,
      gerarCsv(resultado.alocacoes, [
        { titulo: 'Dia', valor: (a) => dataCsv(a.dia) },
        { titulo: 'Secador', valor: (a) => a.secador },
        { titulo: 'Erva', valor: (a) => a.erva },
        { titulo: 'Kg de fresco', valor: (a) => numeroCsv(a.kg_fresco) },
        { titulo: 'Horas de secagem', valor: (a) => numeroCsv(a.horas_secagem) },
        { titulo: 'Horas de setup', valor: (a) => numeroCsv(a.horas_setup) },
        { titulo: 'Lote', valor: (a) => a.lote_id },
        { titulo: 'Demanda', valor: (a) => a.demanda_id ?? 'sem demanda' },
      ])
    );
  const exportarNecessidades = () =>
    baixarCsv(
      `${nomeArquivo}_necessidades_${periodo}.csv`,
      gerarCsv(resultado.necessidades, [
        { titulo: 'Demanda', valor: (n) => n.demanda_id },
        { titulo: 'Erva', valor: (n) => n.erva },
        { titulo: 'Meta (kg)', valor: (n) => numeroCsv(n.kg_meta) },
        { titulo: 'Estágio da meta', valor: (n) => ROTULO_ESTAGIO[n.estagio_meta] },
        { titulo: 'Fresco necessário (kg)', valor: (n) => numeroCsv(n.kg_fresco) },
        { titulo: 'Prazo', valor: (n) => dataCsv(n.prazo) },
        { titulo: 'Coberto no plano (kg)', valor: (n) => numeroCsv(coberto[n.demanda_id] ?? 0) },
        { titulo: 'Falta (kg)', valor: (n) => numeroCsv(falta(n.demanda_id, n.kg_fresco)) },
        { titulo: 'Situação', valor: (n) => SITUACAO[situacao(n)].rotulo },
      ])
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {resultado.viavel ? (
          <Etiqueta cor="verde">Viável</Etiqueta>
        ) : (
          <Etiqueta cor="vermelho">Com pendências</Etiqueta>
        )}
        <span className="text-sm text-gray-600">
          {formatarData(resultado.inicio)} a {formatarData(resultado.fim)}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {resultado.alocacoes.length > 0 && (
            <Button variant="secondary" onClick={exportarCronograma}>Baixar cronograma (Excel)</Button>
          )}
          {resultado.necessidades.length > 0 && (
            <Button variant="secondary" onClick={exportarNecessidades}>Baixar necessidades (Excel)</Button>
          )}
        </div>
      </div>

      {resultado.avisos.map((aviso) => <Alerta key={aviso} tipo="aviso">{aviso}</Alerta>)}

      {resultado.pendencias.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Pendências ({resultado.pendencias.length})</h3>
          <ul className="space-y-2">
            {resultado.pendencias.map((p, i) => (
              <li key={i} className="flex gap-3 items-start text-sm">
                <Etiqueta cor={COR_PENDENCIA[p.tipo]}>{ROTULO_PENDENCIA[p.tipo]}</Etiqueta>
                <span>{p.mensagem}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {aCobrirDepois.length > 0 && (
        <Alerta tipo="aviso">
          Demandas que vencem depois de {formatarData(resultado.fim)} já recebem a secagem deste plano. Ainda faltam{' '}
          {aCobrirDepois.map(([erva, kg]) => `${formatarKg(kg)} de ${erva}`).join(', ')} (erva fresca) para elas, a
          cobrir no próximo plano.
        </Alerta>
      )}

      {Object.keys(ocupacao).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(ocupacao).map(([secador, pct]) => (
            <Card key={secador}>
              <p className="text-sm font-semibold text-[#211E16] mb-1">Ocupação {secador}</p>
              {/* null = sem dia disponível no horizonte: "não aplicável", nunca 0% */}
              <p className="text-2xl font-bold text-[#006F44]">{pct === null ? 'n/a' : `${formatarNumero(pct)}%`}</p>
              <p className="text-xs text-gray-500">
                {formatarHoras(kpis.horas_ocupadas?.[secador] ?? 0)} de{' '}
                {formatarHoras(kpis.horas_disponiveis?.[secador] ?? 0)} disponíveis
              </p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h3 className="font-semibold mb-3">Cronograma de secagem</h3>
        <Cronograma alocacoes={resultado.alocacoes} />
      </Card>

      {resultado.necessidades.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Necessidade de erva fresca (cálculo reverso)</h3>
          <ItemList
            colunas={['Demanda', 'Erva', 'Meta', 'Fresco necessário', 'Prazo', 'Coberto no plano', 'Falta', 'Situação']}
            dados={resultado.necessidades.map((n) => ({
              demanda: `#${n.demanda_id}`,
              erva: n.erva,
              meta: `${formatarKg(n.kg_meta)} (${ROTULO_ESTAGIO[n.estagio_meta].toLowerCase()})`,
              fresco: formatarKg(n.kg_fresco),
              prazo: formatarData(n.prazo),
              coberto: formatarKg(coberto[n.demanda_id] ?? 0),
              falta: falta(n.demanda_id, n.kg_fresco) < FOLGA_KG ? '—' : formatarKg(falta(n.demanda_id, n.kg_fresco)),
              situacao: <Etiqueta cor={SITUACAO[situacao(n)].cor}>{SITUACAO[situacao(n)].rotulo}</Etiqueta>,
            }))}
          />
        </Card>
      )}

      {resultado.alocacoes.length > 0 && (
        <details className="bg-[#FFFFFF] border border-[#C7C8CA] rounded-lg p-5">
          <summary className="font-semibold cursor-pointer">Detalhe das alocações</summary>
          <div className="mt-4">
            <ItemList
              colunas={['Dia', 'Secador', 'Erva', 'Kg fresco', 'Secagem', 'Setup', 'Lote', 'Demanda']}
              dados={resultado.alocacoes.map((a) => ({
                dia: formatarData(a.dia),
                secador: a.secador,
                erva: a.erva,
                kg: formatarKg(a.kg_fresco),
                secagem: formatarHoras(a.horas_secagem),
                setup: formatarHoras(a.horas_setup),
                lote: `#${a.lote_id}`,
                demanda: a.demanda_id ? `#${a.demanda_id}` : 'sem demanda',
              }))}
            />
          </div>
        </details>
      )}
    </div>
  );
}
