import { ROTULO_ESTAGIO, ROTULO_PENDENCIA, formatarData, formatarHoras, formatarKg, formatarNumero } from '../formatar';
import { Alocacao, ResultadoSimulacao, TipoPendencia } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Card, Etiqueta, EtiquetaCor } from './ui';

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

export default function ResultadoPlano({ resultado }: { resultado: ResultadoSimulacao }) {
  const { kpis } = resultado;
  const ocupacao = kpis.ocupacao_planejada_pct ?? {};
  const saldo = kpis.saldo_nao_alocado_kg ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {resultado.viavel ? (
          <Etiqueta cor="verde">Viável</Etiqueta>
        ) : (
          <Etiqueta cor="vermelho">Com pendências</Etiqueta>
        )}
        <span className="text-sm text-gray-600">
          {formatarData(resultado.inicio)} a {formatarData(resultado.fim)}
        </span>
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
            colunas={['Demanda', 'Erva', 'Meta', 'Fresco necessário', 'Prazo', 'Saldo da erva']}
            dados={resultado.necessidades.map((n) => ({
              demanda: `#${n.demanda_id}`,
              erva: n.erva,
              meta: `${formatarKg(n.kg_meta)} (${ROTULO_ESTAGIO[n.estagio_meta].toLowerCase()})`,
              fresco: formatarKg(n.kg_fresco),
              prazo: formatarData(n.prazo),
              saldo: saldo[n.erva] ? formatarKg(saldo[n.erva]) : '—',
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
