import { ReactNode, useState } from 'react';

import { formatarHoras, formatarNumero } from '../formatar';
import { useApi } from '../hooks';
import { useSessao } from '../sessao';
import { Capacidade, Erva, Rendimento, Secador } from '../tipos';
import { FormularioCapacidade, FormularioErva, FormularioSecador } from './FormulariosCadastro';
import { Alerta, Button, Card, Etiqueta } from './ui';

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

type Edicao =
  | { tipo: 'erva'; erva: Erva | null }
  | { tipo: 'secador'; secador: Secador | null }
  | { tipo: 'capacidade'; erva: Erva; secador: Secador; capacidade: Capacidade | null };

function LinkEditar({ onClick, children = 'editar' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="text-xs text-[#006F44] hover:underline" onClick={onClick}>
      {children}
    </button>
  );
}

export default function MatrizCapacidade() {
  const { pode } = useSessao();
  const podeGerenciar = pode('cadastro.gerenciar');

  // Inativos só aparecem para quem pode reativá-los
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const filtro = mostrarInativos ? '?ativos=false' : '';
  const ervas = useApi<Erva[]>(`/ervas${filtro}`);
  const secadores = useApi<Secador[]>(`/secadores${filtro}`);
  const capacidades = useApi<Capacidade[]>('/capacidades');
  const rendimentos = useApi<Rendimento[]>('/rendimentos');
  const erro = ervas.erro || secadores.erro || capacidades.erro || rendimentos.erro;

  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const capacidade = (ervaId: number, secadorId: number) =>
    capacidades.dados?.find((c) => c.erva_id === ervaId && c.secador_id === secadorId) ?? null;
  const rendimento = (ervaId: number) => rendimentos.dados?.find((r) => r.erva_id === ervaId) ?? null;

  const aoSalvar = () => {
    setEdicao(null);
    ervas.recarregar();
    secadores.recarregar();
    capacidades.recarregar();
    rendimentos.recarregar();
  };
  const aoCancelar = () => setEdicao(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#211E16]">Matriz de Capacidade</h1>
          <p className="text-sm text-gray-500">
            Parâmetros de cada erva em cada secador. Campo não informado aparece como pendência na simulação.
          </p>
        </div>
        {podeGerenciar && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Mostrar inativos
            </label>
            <Button variant="secondary" onClick={() => setEdicao({ tipo: 'secador', secador: null })}>+ Novo secador</Button>
            <Button onClick={() => setEdicao({ tipo: 'erva', erva: null })}>+ Nova erva</Button>
          </div>
        )}
      </div>
      {erro && <Alerta>{erro}</Alerta>}

      {/* key: trocar de registro recomeça o formulário com os valores dele */}
      {edicao?.tipo === 'erva' && (
        <FormularioErva key={`erva-${edicao.erva?.id}`} erva={edicao.erva}
          rendimento={edicao.erva && rendimento(edicao.erva.id)} aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}
      {edicao?.tipo === 'secador' && (
        <FormularioSecador key={`secador-${edicao.secador?.id}`} secador={edicao.secador}
          aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}
      {edicao?.tipo === 'capacidade' && (
        <FormularioCapacidade key={`cap-${edicao.erva.id}-${edicao.secador.id}`} erva={edicao.erva}
          secador={edicao.secador} capacidade={edicao.capacidade} aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-[#C7C8CA] text-xs font-semibold">
            <tr>
              <th className="py-3 px-4">Erva</th>
              {(secadores.dados ?? []).map((s) => (
                <th key={s.id} className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {s.codigo}
                    {!s.ativo && <Etiqueta cor="amarelo">inativo</Etiqueta>}
                    {podeGerenciar && <LinkEditar onClick={() => setEdicao({ tipo: 'secador', secador: s })} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(ervas.dados ?? []).map((erva) => {
              const rend = rendimento(erva.id);
              return (
                <tr key={erva.id} className="border-b border-[#C7C8CA]/30 align-top">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{erva.nome}</span>
                      {!erva.ativo && <Etiqueta cor="amarelo">inativa</Etiqueta>}
                      {podeGerenciar && <LinkEditar onClick={() => setEdicao({ tipo: 'erva', erva })} />}
                    </div>
                    <div className="text-xs text-gray-500">
                      {erva.codigo}
                      <br />
                      Regime: {valor(erva.regime_horas_dia, (x) => `${formatarNumero(x)} h/dia`)}
                      <br />
                      Espera máx.: {valor(erva.espera_maxima_dias, (x) => `${x} dias`)}
                      <br />
                      Fresco/desidratado: {valor(rend?.fresco_por_desidratado ?? null, (x) => formatarNumero(x, 4))}
                      <br />
                      Desidratado/moído: {valor(rend?.desidratado_por_moido ?? null, (x) => formatarNumero(x, 4))}
                    </div>
                  </td>
                  {(secadores.dados ?? []).map((s) => {
                    const cap = capacidade(erva.id, s.id);
                    const editar = () => setEdicao({ tipo: 'capacidade', erva, secador: s, capacidade: cap });
                    return (
                      <td key={s.id} className="py-3 px-4">
                        {cap ? <Parametros cap={cap} /> : <Etiqueta>não opera</Etiqueta>}
                        {podeGerenciar && (
                          <div className="mt-2">
                            <LinkEditar onClick={editar}>{cap ? 'editar' : 'cadastrar'}</LinkEditar>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {ervas.dados?.length === 0 && (
              <tr><td className="py-6 px-4 text-gray-500" colSpan={99}>Nenhuma erva cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
