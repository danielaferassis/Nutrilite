import { formatarHoras, formatarNumero } from '../formatar';
import { useApi } from '../hooks';
import { Capacidade, Erva, Secador } from '../tipos';
import { Alerta, Card, Etiqueta } from './ui';

// Campo nulo = não informado. Nunca mostrar como zero: o motor gera PARAM_AUSENTE
const valor = (v: string | number | null, formatar: (x: string | number) => string) =>
  v === null ? <span className="text-amber-700">não informado</span> : formatar(v);

function Parametros({ cap }: { cap: Capacidade }) {
  return (
    <dl className="text-xs grid grid-cols-2 gap-x-2 gap-y-1">
      <dt className="text-gray-500">Modo</dt>
      <dd>{cap.modo === null ? <span className="text-amber-700">não informado</span> : cap.modo === 'continuo' ? 'Contínuo' : 'Por carga'}</dd>
      {cap.modo !== 'por_carga' && (
        <>
          <dt className="text-gray-500">Vazão</dt>
          <dd>{valor(cap.kg_fresco_por_hora, (x) => `${formatarNumero(x)} kg/h`)}</dd>
        </>
      )}
      {cap.modo === 'por_carga' && (
        <>
          <dt className="text-gray-500">Carga</dt>
          <dd>{valor(cap.kg_por_carga, (x) => `${formatarNumero(x)} kg`)} / {valor(cap.horas_por_carga, formatarHoras)}</dd>
        </>
      )}
      <dt className="text-gray-500">Setup ini/fim/dia</dt>
      <dd>
        {valor(cap.setup_inicial_h, formatarHoras)} / {valor(cap.setup_final_h, formatarHoras)} /{' '}
        {valor(cap.setup_diario_h, formatarHoras)}
      </dd>
      <dt className="text-gray-500">Prioridade</dt>
      <dd>{cap.prioridade ?? 'sem preferência'}</dd>
    </dl>
  );
}

export default function MatrizCapacidade() {
  const ervas = useApi<Erva[]>('/ervas');
  const secadores = useApi<Secador[]>('/secadores');
  const capacidades = useApi<Capacidade[]>('/capacidades');
  const erro = ervas.erro || secadores.erro || capacidades.erro;

  const capacidade = (ervaId: number, secadorId: number) =>
    capacidades.dados?.find((c) => c.erva_id === ervaId && c.secador_id === secadorId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Matriz de Capacidade</h1>
        <p className="text-sm text-gray-500">
          Parâmetros de cada erva em cada secador. Por enquanto o cadastro é feito direto no banco.
        </p>
      </div>
      {erro && <Alerta>{erro}</Alerta>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-[#C7C8CA] text-xs font-semibold">
            <tr>
              <th className="py-3 px-4">Erva</th>
              {(secadores.dados ?? []).map((s) => <th key={s.id} className="py-3 px-4">{s.codigo}</th>)}
            </tr>
          </thead>
          <tbody>
            {(ervas.dados ?? []).map((erva) => (
              <tr key={erva.id} className="border-b border-[#C7C8CA]/30 align-top">
                <td className="py-3 px-4">
                  <div className="font-semibold">{erva.nome}</div>
                  <div className="text-xs text-gray-500">
                    Regime: {valor(erva.regime_horas_dia, (x) => `${formatarNumero(x)} h/dia`)}
                    <br />
                    Espera máx.: {valor(erva.espera_maxima_dias, (x) => `${x} dias`)}
                  </div>
                </td>
                {(secadores.dados ?? []).map((s) => {
                  const cap = capacidade(erva.id, s.id);
                  return (
                    <td key={s.id} className="py-3 px-4">
                      {cap ? <Parametros cap={cap} /> : <Etiqueta>não opera</Etiqueta>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {ervas.dados?.length === 0 && (
              <tr><td className="py-6 px-4 text-gray-500" colSpan={99}>Nenhuma erva cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
