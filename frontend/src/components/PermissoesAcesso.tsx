import { useEffect, useMemo, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Funcionalidade, Grupo } from '../tipos';
import { Alerta, Button, Card, Etiqueta } from './ui';

// grupo_id → ids das funcionalidades marcadas
type Marcacoes = Record<number, number[]>;

// Sem estas, ninguém consegue mais abrir as telas de acesso
const CODIGOS_ADMINISTRACAO = ['usuario.gerenciar', 'grupo.gerenciar'];

const marcacoesDe = (grupos: Grupo[]): Marcacoes =>
  Object.fromEntries(grupos.map((g) => [g.id, g.funcionalidades.map((f) => f.id)]));

const mesmasFuncionalidades = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export default function PermissoesAcesso() {
  const { sessao } = useSessao();
  const grupos = useApi<Grupo[]>('/grupos');
  const funcionalidades = useApi<Funcionalidade[]>('/funcionalidades');

  const [marcadas, setMarcadas] = useState<Marcacoes>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const originais = useMemo(() => marcacoesDe(grupos.dados ?? []), [grupos.dados]);
  useEffect(() => setMarcadas(originais), [originais]);

  const alterados = (grupos.dados ?? []).filter(
    (g) => !mesmasFuncionalidades(marcadas[g.id] ?? [], originais[g.id] ?? [])
  );

  // A API já devolve ordenado por módulo e nome
  const porModulo = useMemo(() => {
    const mapa = new Map<string, Funcionalidade[]>();
    (funcionalidades.dados ?? []).forEach((f) => {
      const modulo = f.modulo ?? 'Geral';
      mapa.set(modulo, [...(mapa.get(modulo) ?? []), f]);
    });
    return [...mapa.entries()];
  }, [funcionalidades.dados]);

  const alternar = (grupoId: number, funcionalidadeId: number) => {
    const atuais = marcadas[grupoId] ?? [];
    setMarcadas({
      ...marcadas,
      [grupoId]: atuais.includes(funcionalidadeId)
        ? atuais.filter((id) => id !== funcionalidadeId)
        : [...atuais, funcionalidadeId],
    });
    setAviso('');
  };

  /** Códigos de administração que o usuário logado ainda teria com as marcações. */
  const administracaoRestante = (m: Marcacoes) => {
    const meusGrupos = new Set(sessao?.usuario.grupos.map((g) => g.id));
    const ids = new Set(
      (grupos.dados ?? [])
        .filter((g) => g.ativo && meusGrupos.has(g.id))
        .flatMap((g) => m[g.id] ?? [])
    );
    return (funcionalidades.dados ?? [])
      .filter((f) => f.ativo && ids.has(f.id) && CODIGOS_ADMINISTRACAO.includes(f.codigo))
      .map((f) => f.codigo);
  };

  const salvar = async () => {
    const perdidas = administracaoRestante(originais).filter(
      (c) => !administracaoRestante(marcadas).includes(c)
    );
    if (
      perdidas.length &&
      !window.confirm(
        `Com estas alterações você perde ${perdidas.join(' e ')} e pode ficar sem acesso a esta tela. Continuar?`
      )
    ) return;

    setSalvando(true);
    setErro('');
    try {
      for (const g of alterados) {
        await apiFetch(`/grupos/${g.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ funcionalidade_ids: marcadas[g.id] ?? [] }),
        });
        logger.info('Permissões do grupo atualizadas', g.id);
      }
      setAviso(`Permissões salvas (${alterados.map((g) => g.nome).join(', ')}).`);
    } catch (err) {
      setErro(textoDoErro(err));
    } finally {
      setSalvando(false);
      // Recarrega também em caso de falha no meio, para a tela mostrar o que foi gravado
      grupos.recarregar();
    }
  };

  const carregando = grupos.carregando || funcionalidades.carregando;
  const listaGrupos = grupos.dados ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Permissões de Acesso</h1>
        <p className="text-sm text-gray-500">
          Marque o que cada grupo pode fazer. O usuário recebe a soma das permissões dos grupos ativos a que pertence.
        </p>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {grupos.erro && <Alerta>{grupos.erro}</Alerta>}
      {funcionalidades.erro && <Alerta>{funcionalidades.erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <Card>
        {carregando && !listaGrupos.length ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : !listaGrupos.length ? (
          <p className="text-sm text-gray-500">Nenhum grupo cadastrado. Cadastre um grupo na tela Grupos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-[#C7C8CA] text-xs font-semibold">
                <tr>
                  <th className="py-3 px-4">Funcionalidade</th>
                  {listaGrupos.map((g) => (
                    <th key={g.id} className="py-3 px-4 text-center whitespace-nowrap">
                      {g.nome}
                      {!g.ativo && <div className="font-normal text-gray-500">inativo</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porModulo.map(([modulo, lista]) => [
                  <tr key={`m-${modulo}`} className="bg-gray-50">
                    <td colSpan={listaGrupos.length + 1} className="py-2 px-4 text-xs font-semibold uppercase text-gray-600">
                      {modulo}
                    </td>
                  </tr>,
                  ...lista.map((f) => (
                    <tr key={f.id} className="border-b border-[#C7C8CA]/30 hover:bg-gray-50">
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#211E16]">{f.nome}</span>
                          {!f.ativo && <Etiqueta>inativa</Etiqueta>}
                        </div>
                        <div className="text-xs text-gray-500">
                          <code>{f.codigo}</code>
                          {f.descricao && ` — ${f.descricao}`}
                        </div>
                      </td>
                      {listaGrupos.map((g) => (
                        <td key={g.id} className="py-2 px-4 text-center">
                          <input
                            type="checkbox"
                            className="accent-[#006F44] w-4 h-4"
                            aria-label={`${f.nome} para ${g.nome}`}
                            checked={(marcadas[g.id] ?? []).includes(f.id)}
                            onChange={() => alternar(g.id, f.id)}
                          />
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Button onClick={salvar} disabled={!alterados.length || salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Button>
          <Button variant="secondary" onClick={() => setMarcadas(originais)} disabled={!alterados.length || salvando}>
            Descartar
          </Button>
          {alterados.length > 0 && (
            <span className="text-sm text-amber-700">
              {alterados.length} grupo(s) com alterações não salvas
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
