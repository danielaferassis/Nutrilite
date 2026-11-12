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

// Linha "rótulo → valor" com divisória, usada nos blocos da erva e do secador
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-gray-500">{rotulo}</dt>
      <dd className="text-right font-medium text-[#211E16]">{children}</dd>
    </div>
  );
}

function Parametros({ cap }: { cap: Capacidade }) {
  return (
    <dl className="text-xs divide-y divide-[#C7C8CA]/40">
      <Linha rotulo="Modo">
        {cap.modo === null ? <span className="text-amber-700">não informado</span> : cap.modo === 'continuo' ? 'Contínuo' : 'Por carga'}
      </Linha>
      {cap.modo !== 'por_carga' && (
        <Linha rotulo="Vazão">{valor(cap.kg_fresco_por_hora, (x) => `${formatarNumero(x)} kg/h`)}</Linha>
      )}
      {cap.modo === 'por_carga' && (
        <Linha rotulo="Carga">
          {valor(cap.kg_por_carga, (x) => `${formatarNumero(x)} kg`)} / {valor(cap.horas_por_carga, formatarHoras)}
        </Linha>
      )}
      <Linha rotulo="Setup ini/fim/dia">
        {valor(cap.setup_inicial_h, formatarHoras)} / {valor(cap.setup_final_h, formatarHoras)} /{' '}
        {valor(cap.setup_diario_h, formatarHoras)}
      </Linha>
      <Linha rotulo="Prioridade">
        {cap.prioridade ?? <span className="font-normal text-gray-400">sem preferência</span>}
      </Linha>
    </dl>
  );
}

type Edicao =
  | { tipo: 'erva'; erva: Erva | null }
  | { tipo: 'secador'; secador: Secador | null }
  | { tipo: 'capacidade'; erva: Erva; secador: Secador; capacidade: Capacidade | null };

function LinkEditar({ onClick, children = 'editar' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      className="text-xs font-semibold text-[#006F44] rounded px-1.5 py-0.5 hover:bg-[#006F44]/10"
      onClick={onClick}
    >
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
        <table className="w-full text-sm text-left border-separate border-spacing-0">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="py-3 px-3 border-b border-[#C7C8CA] w-56">Erva</th>
              {(secadores.dados ?? []).map((s) => (
                <th key={s.id} className="py-3 px-3 border-b border-[#C7C8CA] min-w-56">
                  <div className="flex items-center gap-2 normal-case tracking-normal">
                    <span className="text-sm font-bold text-[#211E16]">{s.codigo}</span>
                    {!s.ativo && <Etiqueta cor="amarelo">inativo</Etiqueta>}
                    {podeGerenciar && (
                      <span className="ml-auto">
                        <LinkEditar onClick={() => setEdicao({ tipo: 'secador', secador: s })} />
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-normal normal-case tracking-normal text-gray-500">{s.nome}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(ervas.dados ?? []).map((erva) => {
              const rend = rendimento(erva.id);
              return (
                <tr key={erva.id} className="align-top">
                  <td className="p-3 border-b border-[#C7C8CA]/50">
                    <div className="rounded-lg bg-[#F4F5F2] p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#211E16]">{erva.nome}</span>
                        {!erva.ativo && <Etiqueta cor="amarelo">inativa</Etiqueta>}
                        {podeGerenciar && (
                          <span className="ml-auto">
                            <LinkEditar onClick={() => setEdicao({ tipo: 'erva', erva })} />
                          </span>
                        )}
                      </div>
                      <div className="mt-1 mb-2">
                        <Etiqueta>{erva.codigo}</Etiqueta>
                      </div>
                      <dl className="text-xs divide-y divide-[#C7C8CA]/40 border-t border-[#C7C8CA]/40">
                        <Linha rotulo="Regime">{valor(erva.regime_horas_dia, (x) => `${formatarNumero(x)} h/dia`)}</Linha>
                        <Linha rotulo="Espera máx.">{valor(erva.espera_maxima_dias, (x) => `${x} dias`)}</Linha>
                        <Linha rotulo="Fresco/desidratado">
                          {valor(rend?.fresco_por_desidratado ?? null, (x) => formatarNumero(x, 4))}
                        </Linha>
                        <Linha rotulo="Desidratado/moído">
                          {valor(rend?.desidratado_por_moido ?? null, (x) => formatarNumero(x, 4))}
                        </Linha>
                      </dl>
                    </div>
                  </td>
                  {(secadores.dados ?? []).map((s) => {
                    const cap = capacidade(erva.id, s.id);
                    const editar = () => setEdicao({ tipo: 'capacidade', erva, secador: s, capacidade: cap });
                    return (
                      <td key={s.id} className="p-3 border-b border-[#C7C8CA]/50">
                        {cap ? (
                          <div className="rounded-lg border border-[#C7C8CA] bg-white shadow-sm">
                            <div className="px-3 py-1">
                              <Parametros cap={cap} />
                            </div>
                            {podeGerenciar && (
                              <div className="flex justify-end border-t border-[#C7C8CA]/60 px-2 py-1">
                                <LinkEditar onClick={editar} />
                              </div>
                            )}
                          </div>
                        ) : (
                          // Sem capacidade cadastrada: o motor não aloca a erva neste secador
                          <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#C7C8CA] p-3">
                            <Etiqueta>não opera</Etiqueta>
                            {podeGerenciar && <LinkEditar onClick={editar}>cadastrar</LinkEditar>}
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
