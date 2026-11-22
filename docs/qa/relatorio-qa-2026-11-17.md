# Relatório de QA: testes e validações de usabilidade (17/11/2026)

Branch: `feature/testes-validacoes-usabilidade`, criada a partir da `main` em `5a788c5`.

## Como foi feito

- **Suítes existentes:**
  - backend: `pytest`, **285 passaram**;
  - frontend: `tsc` sem erros e Vitest com **64 passando**.
- **Simulação ao vivo:** uma cópia isolada da stack (MySQL vazio, migrations e `dados-ficticios`) foi exercitada pela API. Os cenários foram:
  - login e cadastros;
  - demanda → previsão → simulação → salvar → aprovar;
  - cronograma e indicadores;
  - controle de acesso;
  - entradas inválidas: datas absurdas, períodos invertidos, duplicidades e números fora de faixa.
- **Revisão de código:** cobriu o motor (`planner/`), os routers e schemas e todas as telas do front.
- **Reprodução:** os casos marcados **[reproduzido]** foram executados com entrada concreta. Os marcados **[leitura]** foram confirmados no código, sem execução.

Severidade: **Alta** gera dado errado, perda de acesso ou erro 500 no fluxo principal. **Média** gera número enganoso ou fluxo confuso. **Baixa** é acabamento.

## Status das correções

Feitas na mesma branch, com teste de regressão. Cada teste foi rodado contra o código anterior para confirmar que falhava.

| Item | Status | Testes |
|---|---|---|
| A1: ordem do guloso | **Corrigido.** Lote que vence hoje passa na frente do espalhamento. | `test_alocacao.py` e o invariante "lote perdido não cede secador" |
| A2: erva incompleta zera o plano | **Corrigido.** Só a erva sai; a API avisa que o plano é parcial e ele continua não aprovável. Rendimento só é exigido de quem converte. | `test_ervas_incompletas.py` e `test_planos.py` |
| A3: escalada de privilégio | **Corrigido.** Ninguém concede permissão que não tem. Vale também para **criar** usuário admin e para dar ou reativar funcionalidades de grupo, dois casos que apareceram durante a correção. | `test_acesso_protecoes.py` |
| A4: sistema sem administrador | **Corrigido**: 409 nos cinco caminhos. | `test_acesso_protecoes.py` |
| M13: excluir usuário com histórico | **Corrigido**: 409 com "desative-o". | `test_acesso_protecoes.py` |
| A5: data errada estica o período | **Corrigido.** Data longe da mediana da aba (ano trocado), fora da ordem no meio da sequência ou desgarrada na primeira/última linha vira erro da célula; o período só usa as datas plausíveis e nada é gravado enquanto houver erro. | `test_importacao_previsoes.py` |
| A6: número "válido" dá 500 | **Corrigido.** `NaN`/`Infinity` viram "valor não numérico"; a faixa é conferida **depois** do arredondamento (menor que 0,001 kg e acima do teto da coluna são erro da célula). No Infinity, o erro indica linha e coluna, e uma falha imprevista vira erro daquela linha. | `test_importacao_previsoes.py` e `test_importacao_infinity.py` |
| A7: duplo clique grava duas vezes | **Já resolvido** na modernização do front (`Button` com `carregando` fica desabilitado). Faltava teste: agora há um de duplo clique com a resposta pendente em Previsões, Bloqueios e Recebimentos. | `EntradaPrevisoes`, `Bloqueios` e `CronogramaRecebimentos.test.tsx` |
| Rota de exemplo `/api/items` | **Removida.** O front não a usava; a tabela continua, porque só muda por migration. | `test_rotas_protegidas.py` |

**Testes para pegar problemas semelhantes:**

- **Invariantes do motor** (`tests/planner/test_invariantes.py`): 300 cenários aleatórios × 2 testes. No motor antigo, 78 deles falharam.
- **Varredura das rotas** (`tests/test_rotas_protegidas.py`): exige 401 sem sessão e permissão específica em toda rota que altera dados.

A suíte passou de 285 para 1.006 testes no backend (1.043 depois do A5–A7).

---

## 1. Prioridade alta

### A1. Motor: espalhar a erva entre secadores passa na frente do vencimento e gera perda evitável [reproduzido]
`backend/app/planner/engine.py:214-223`. A ordenação usa `secadores_por_erva` **antes** de `vencimentos`.

- **Entrada:**
  - secadores S1 e S2, cada um com 100 kg/dia para as ervas A e B;
  - lote A de 200 kg que vence hoje;
  - lote B de 100 kg com 10 dias de espera.
- **Saída:** S1 seca A, S2 seca B e sobra `CAPACIDADE_EXCEDIDA` de 100 kg de A.
- **Esperado:** A usa S1 e S2 hoje e B seca amanhã, sem perda.
- **Correção:** ordenar primeiro por vencimento (ou por "vence hoje") e usar o espalhamento só como desempate.

### A2. Uma erva com cadastro incompleto zera o plano inteiro [reproduzido]
Com os dados fictícios, a simulação normal dá 4 necessidades e 16 alocações. Depois de cadastrar **uma** demanda de Agrião (sem rendimento e sem tempo de espera), a mesma simulação devolve **0 necessidades, 0 alocações e KPIs vazios** para todas as ervas.

Isso respeita a regra "parâmetro ausente não vira padrão", mas na prática o PCP fica sem plano nenhum por causa de um item. O caso mais grave é a validação do rendimento (`planner/validation.py:304`): ela trava a simulação mesmo quando a erva só tem oferta ou tem demanda em estágio **fresco**, situações em que o rendimento nem entra na conta.

- **Correção:**
  1. exigir rendimento só para ervas com demanda desidratada ou moída;
  2. avaliar simular as ervas completas e deixar as incompletas como `PARAM_AUSENTE`, com o plano marcado "parcial / não aprovável".

### A3. Escalada de privilégio: quem gerencia usuários se coloca no grupo Administrador [leitura]
`backend/app/routers/usuarios.py:90-91`. O `PATCH /api/usuarios/{id}` aplica `grupo_ids` sem conferir se o alvo é o próprio usuário nem quais permissões os grupos dão.

- **Correção:**
  - proibir alterar os próprios grupos;
  - ou só permitir atribuir grupos cujas permissões o solicitante já tem.

### A4. O sistema pode ficar sem nenhum administrador [reproduzido em parte]
Um `PATCH /api/grupos/{admin}` com `funcionalidade_ids: []` respondeu **200**: o grupo Administrador ficou vazio e o acesso sumiu na hora. Pelo mesmo caminho passam:

- desativar ou excluir o grupo admin;
- tirar os próprios grupos;
- desativar ou excluir o último outro admin.

Só "desativar/excluir a si mesmo" é barrado. Depois disso, a única saída é a CLI no servidor.

- **Correção:** antes dessas operações, garantir que ainda exista pelo menos um usuário ativo com `usuario.gerenciar` e `grupo.gerenciar`; senão, responder 409.

### A5. Importação da planilha: uma data digitada errado apaga previsões [reproduzido pelo teste]
`routers/previsoes_importacao.py:72-80` e `importacao/programacao_ervas.py:186-188`. O período sincronizado vai da menor à maior data da aba.

- **Cenário:** uma linha de dez/2026 digitada como 03/12/2028 estende o período até 2028. A sincronização remove previsões de 2027 que não estão na aba.
- **Correção:** recusar datas fora do mês ou ano da aba (ou muito longe da mediana) e destacar o período na prévia.

### A6. Importação: número "válido" gera erro 500 [reproduzido pelo teste]
Arquivos: `importacao/programacao_ervas.py:97-108` e `parsers/infinity.py:121-133`.

- **Na planilha:**
  - `0.0004` kg passa no `> 0`, vira `0.000` no arredondamento e quebra a constraint do banco: **500**;
  - o texto `NaN` lança `InvalidOperation` (não é `ValueError`): **500 já na prévia**;
  - `Infinity` e valores com mais de 9 dígitos inteiros estouram `Numeric(12,3)`.
- **No Infinity:** o worker cai em "Erro inesperado" sem indicar linha.
- **Correção:**
  - recusar valores não finitos;
  - validar a faixa **depois** do arredondamento;
  - capturar `InvalidOperation` e registrar o erro na linha.

### A7. Front: duplo clique grava dois registros [leitura]
Arquivos: `EntradaPrevisoes.tsx`, `Bloqueios.tsx`, `CronogramaRecebimentos.tsx`.

- **Problema:** nenhum dos três desabilita o botão durante o envio. Duas previsões ou dois recebimentos inflam a oferta e o kg recebido da simulação.
- **Correção:** usar o mesmo padrão `salvando`/`disabled` de `GestaoDemandas`.

---

## 2. Prioridade média: números e regras

### Cálculos e KPIs

| # | Achado | Onde | Correção |
|---|---|---|---|
| M1 | **A perda não aparece nos KPIs** [reproduzido]. Com os fictícios, 4.500 kg de camomila vencem sem secador (`CAPACIDADE_EXCEDIDA`), e mesmo assim `saldo_nao_alocado_kg` mostra CAMOMILA = **0** e a ocupação fica entre 3% e 10%. Quem lê só os KPIs não percebe a perda. | `planner/engine.py` (KPIs) | Criar o KPI `kg_perdido` por erva. |
| M2 | O KPI `saldo_nao_alocado_kg` e a pendência `SALDO_NAO_ALOCADO` têm o mesmo nome, mas medem coisas diferentes. Exemplo: o lote chega depois do prazo e sai `ATRASO`, sem pendência de saldo, mas o KPI marca 100 kg. | `engine.py:379-401` × `470-475` | Renomear o KPI (por exemplo, `nao_atendido_no_prazo_kg`) ou unificar a definição. |
| M3 | Os mesmos kg aparecem em duas pendências: sem oferta, sai `ATRASO` de 100 kg **e** `SALDO_NAO_ALOCADO` de 100 kg. Quem soma vê 200. | `engine.py` | Vincular as duas pendências (causa e efeito) ou não repetir o kg. |
| M4 | A aderência ao plano soma kg de ervas diferentes: planejado 100 kg de camomila e apontado 100 kg de salsa dão 100%. Isso quebra a regra do CLAUDE.md. | `indicadores.py:332,391,410` | Calcular por erva × secador. |
| M5 | **A disponibilidade (OEE) fica abaixo de 100% sem motivo** [reproduzido]. O período de 17 a 23/11, com hoje = 17/11, conta horas disponíveis de dias **futuros**, e sem nenhum apontamento mostra `disponibilidade_pct = 0.0`. | `indicadores.py` | Limitar o denominador até hoje e mostrar "sem apontamentos" (`None`) em vez de 0%. |
| M6 | Horas apontadas em dia fora de operação ou bloqueado entram no numerador, mas o dia não soma ao denominador, então a disponibilidade pode passar de 100%. Uma carga que passa da meia-noite fica inteira no dia de início. | `indicadores.py:370-377,405-410` | Tratar os dois casos à parte, com aviso. |
| M7 | Um lote que chegou antes do início do horizonte entra com o kg cheio, sem descontar o que já foi seco. Em dois planos seguidos, o mesmo lote vira oferta duas vezes. | `simulacao.py:83-103` | Abater os apontamentos ou o plano aprovado anterior. |
| M8 | O sistema aceita rendimento menor que 1. Com `fresco_por_desidratado = 0,5` sai menos fresco que produto final, o que é fisicamente impossível. | `schemas.py:387` | Exigir ≥ 1. |

### Validação de entrada

| # | Achado | Onde | Correção |
|---|---|---|---|
| M9 | **Datas absurdas aceitas** [reproduzido]: demanda com prazo em 01/01/2000 e em 31/12/9999, previsão chegando em 01/01/1990 e recebimento em 1900, todos com 201. Só a data futura do recebimento é barrada. | `schemas.py` | Faixa plausível (por exemplo, hoje − 1 ano a hoje + 2 anos) e aviso de "prazo já passou" para demanda ou previsão nova. |
| M10 | **Duplicidades sem aviso** [reproduzido]: o bloqueio sobreposto no mesmo secador entrou (201), e a demanda idêntica entra duas vezes e é somada na simulação. | `routers/bloqueios.py:63` e `routers/demandas.py` | Recusar sobreposição de bloqueio (409) e avisar de demanda parecida. |
| M11 | **Faixas sem sentido físico aceitas** [reproduzido]: `reserva_kg = 50` com `kg = 10`, `setup_diario_h = 9999.99` num dia de 24 h e `regime_horas_dia = 0.01`. | `schemas.py` | `reserva ≤ kg`, setups ≤ 24 (e ≤ regime quando estão dentro do regime) e um mínimo razoável para o regime. |
| M12 | Inteiros sem teto (`prioridade`, `espera_maxima_dias`) contra colunas `UNSIGNED`: 4294967296 dá erro 500 no MySQL. | `schemas.py` | `le=` com um limite razoável. |

### Ciclo de vida e importação

| # | Achado | Onde | Correção |
|---|---|---|---|
| M13 | Excluir usuário que tem histórico dá 500 (FK `RESTRICT` sem tratamento). | `routers/usuarios.py:103-111` | 409 com "desative o usuário". |
| M14 | Excluir um rascunho ao mesmo tempo que outro usuário o aprova pode apagar um plano **aprovado**. | `routers/planos.py:243-254` | `FOR UPDATE`, ou `DELETE … WHERE status='rascunho'` conferindo `rowcount`. |
| M15 | Um rascunho antigo é aprovado sem conferir se cadastro, demandas, previsões ou bloqueios mudaram, nem se o horizonte já passou. | `routers/planos.py` (`_aprovar`) | Guardar um hash da entrada e pedir nova simulação se divergir (409). |
| M16 | A importação da planilha remove previsões com talhão cadastradas por **outros** usuários, inclusive pela Fonte fornecedora. A prévia e a aplicação não são atômicas, então dois envios simultâneos podem duplicar previsões. | `routers/previsoes_importacao.py` | — |

---

## 3. Prioridade média: usabilidade (frontend)

| # | Achado | Onde |
|---|---|---|
| U1 | Quando a sessão expira (401), o usuário vai direto para `/login` e perde o que digitou. Depois do login, cai no Dashboard, não na tela onde estava. | `api.ts:72-74`, `Login.tsx:22` |
| U2 | O menu mostra Demandas, Bloqueios e Plano para a **Fonte fornecedora**, que só recebe "sem permissão". Só as rotas de administração são filtradas. | `App.tsx:27-36,63` |
| U3 | O `useApi` mantém dados antigos depois de erro e não descarta respostas fora de ordem. No Cronograma com período invertido, aparece o erro e, logo abaixo, a tabela do período anterior. Digitar o ano dispara várias requisições, e uma resposta atrasada pode sobrescrever a correta. | `hooks.ts:14-29` |
| U4 | O resultado da simulação continua na tela depois de o usuário mudar início, fim ou dias. "Simular e salvar" grava outra coisa. O botão é `type="button"`, então pula o `required` das datas. | `PlanoSecagem.tsx:72-86,204` |
| U5 | A tolerância de 1e-6 kg com exibição em 1 casa decimal faz aparecer "Falta 0 kg" com a etiqueta vermelha "Atraso". | `ResultadoPlano.tsx`, `formatar.ts` |
| U6 | O Dashboard engole erros: se `/planos` falhar, mostra "Nenhum plano aprovado cobre hoje", o que é falso. | `DashboardPCP.tsx` |
| U7 | O campo de arquivo não é zerado depois de importar ou cancelar. Escolher o mesmo arquivo de novo não faz nada, e a tela parece travada. | `ImportacaoPrevisoes.tsx`, `ImportacaoInfinity.tsx` |
| U8 | Na capacidade, ao trocar o modo, os campos ocultos do outro modo continuam sendo enviados e gravados. A matriz mostra "Vazão: não informado" quando o modo está vazio, mesmo com o kg por carga preenchido. | `FormulariosCadastro.tsx`, `MatrizCapacidade.tsx` |
| U9 | As mensagens de erro usam nomes técnicos: "ate não pode ser anterior a de". | `routers/cronograma.py`, `routers/indicadores.py` |

---

## 4. Prioridade baixa (acabamento)

- **Formulários e edição:**
  - Excluir o registro que está em edição deixa o formulário aberto; ao salvar, aparece "Registro não encontrado". Acontece em Demandas, Previsões e Bloqueios.
  - Trocar de linha durante a edição descarta o que foi digitado sem perguntar.
  - Nos campos de data, falta `min={inicio}` no campo Fim de Bloqueios e do Plano.
  - Um filtro "de > até" mostra "Nenhuma demanda cadastrada", como se o banco estivesse vazio.
- **Importação e OEE:**
  - "Reprocessar" e "Cancelar" importação não ficam desabilitados nem pedem confirmação.
  - O Painel de OEE não recarrega quando a importação termina.
  - O `reprocessar` não zera `linhas_ignoradas`.
  - Reimportar o Infinity com uma linha corrigida faz a linha ser ignorada sem aviso.
- **Acessibilidade e navegação:**
  - IDs duplicados nos campos (os dois "Erva" e os dois "Origem"); usar `useId()`.
  - O Modal não prende o foco.
  - `/` mostra o Login mesmo com sessão ativa.
  - "Sair" não trata falha de rede.
- **Textos:** há termos de português de Portugal, "Registo Manual" e "Guardar Previsão" (`EntradaPrevisoes.tsx`).
- **Rota de exemplo e backend:**
  - A rota de exemplo `/api/items` continua ativa: qualquer perfil logado cria e apaga itens.
  - O CSV em UTF-16 recebe a mensagem enganosa "não é .csv".
  - "Talhão 1A" e "1B" colapsam no mesmo rótulo.
  - A aderência perde o planejado quando o código do secador é renomeado.

---

## 5. Para confirmar com o PCP (não são bugs)

- **Regra dos 15 dias:** hoje o vencimento é `chegada + espera`, inclusivo. Com espera de 15, a erva pode ser seca no 16º dia de calendário.
- **Fonte fornecedora:** pode escolher a origem "Fazenda Própria". Confirmar se é desejado.
- **Prioridade alta com prazo depois do horizonte:** uma demanda nesse caso consome fresco antes de outra que vence amanhã.
- **Reforço no mesmo dia:** o secador de reforço fica com a campanha aberta e nunca paga o setup final, o que subestima as horas.
- **Fim do horizonte:** como o motor só olha lotes até o `fim`, a campanha é encerrada (e paga limpeza) no último dia, mesmo com oferta logo depois.

## 6. O que foi verificado e está correto

- **Conversão reversa:** a ordem e o arredondamento estão corretos, e a reserva entra antes da conversão.
- **Capacidade e alocação:**
  - o regime de 12 h da camomila é respeitado;
  - setups inicial, diário e final e a troca de erva são cobrados;
  - só entram cargas inteiras por dia;
  - nenhum secador passou de 24 h por dia (máximo observado: 21 h);
  - bloqueios valem com início e fim inclusivos.
- **Perda da camomila nos fictícios:** é real. Ela só cabe em SCB01 e SCB03, que somam cerca de 550 kg/dia em 12 h, e um lote de 6.000 kg com 3 dias de espera não cabe.
- **KPIs:** denominador zero vira `None` (e o front mostra "n/a"), e a ocupação é medida em horas.
- **Validação de períodos:**
  - fim < início dá 422 em simulação, plano, bloqueio (criar e editar), cronograma e indicadores;
  - o horizonte é limitado a 366 dias.
- **Datas:**
  - "hoje" usa America/Fortaleza;
  - o front nunca usa `new Date('YYYY-MM-DD')`, então não há deslocamento de um dia.
- **Outras regras:**
  - plano com `PARAM_AUSENTE` não é aprovado (409);
  - previsão já recebida fica travada;
  - recebimento com data futura é recusado.
- **Acesso:** a Fonte fornecedora só vê as próprias previsões, todas as rotas checam permissão no backend, e o usuário não consegue desativar nem excluir a si mesmo.
- **Sessão:** cookie HttpOnly com SameSite=Strict, ociosidade e duração máxima, e limite de tentativas no login.
- **Exportação CSV:** usa `;`, vírgula decimal, dd/mm/aaaa e BOM.

## Ordem de correção sugerida

1. **A1, A2, A3, A4.** Corrigem cálculo errado e perda de acesso; A2 também afeta o roteiro da demonstração.
2. **A5, A6, A7.** Corrigem dados corrompidos e erros 500.
3. **M1–M5 e U1–U4.** Corrigem números enganosos na tela e fluxos confusos.
4. **O restante.** Validações de faixa, mensagens e acabamento.
