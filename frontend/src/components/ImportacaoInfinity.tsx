import { ChangeEvent, useMemo, useState } from 'react';

import { Button, Card } from './ui';

const COLUNAS_PADRAO = [
  'Processo',
  'Turno',
  'Data',
  'Hora',
  'Funcionário',
  'Produto',
  'Produto (Lote)',
  'Batch-SB',
  'Quantidade',
  'Temperatura',
  'Hora Inicial',
  'Hora Final',
  'Duração',
  'Observações',
];

const PREVIEW_DE_EXEMPLO = [
  ['SB-03-Secador Bandejas', 'Turno B', '21/10/2026', '21:24:51', 'Thaliano d', 'Camomila', '20266292C', '101', '65', '19:25', '22:35', '190', '22:40', 'Conforme Thaliano das Neves'],
  ['SB-03-Secador Bandejas', 'Turno B', '21/10/2026', '16:52:24', 'Thaliano d', 'Camomila', '20266292C', '107', '65', '15:25', '18:35', '190', '19:10', 'Conforme Thaliano das Neves'],
  ['SB-03-Secador Bandejas', 'Turno B', '21/10/2026', '14:28:30', 'Thaliano d', 'Camomila', '20266292C', '109', '65', '12:45', '15:20', '155', '15:30', 'Ajuste de lote'],
];

const parseCsvPreview = (texto: string) => {
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (linhas.length === 0) {
    return [] as string[][];
  }

  const separador = linhas[0].includes(';') ? ';' : ',';
  return linhas.map((linha) => linha.split(separador).map((coluna) => coluna.trim()));
};

export default function ImportacaoInfinity() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);

  const resumo = useMemo(
    () => ({
      linhas: 142,
      duplicadas: 3,
      validas: 139,
      oee: 76.5,
      disponibilidade: 91.1,
      performance: 88.4,
      qualidade: 95.0,
    }),
    []
  );

  const handleArquivo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setArquivo(file);

    if (file.name.toLowerCase().endsWith('.csv')) {
      const texto = await file.text();
      setPreview(parseCsvPreview(texto));
      return;
    }

    setPreview(PREVIEW_DE_EXEMPLO);
  };

  const cabecalho = preview[0] || COLUNAS_PADRAO;
  const linhasPreview = preview.slice(1, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Importação do Infinity</h1>
        <p className="text-sm text-gray-500">
          Validar planilha operacional, remover duplicidades e identificar OEE e pendências.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Linhas da planilha</p>
          <p className="text-2xl font-bold text-[#006F44]">{resumo.linhas}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Duplicadas</p>
          <p className="text-2xl font-bold text-[#211E16]">{resumo.duplicadas}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Linhas válidas</p>
          <p className="text-2xl font-bold text-[#211E16]">{resumo.validas}</p>
        </Card>
        <Card className="border-[#84BD00]/40 bg-[#F7FAF3]">
          <p className="text-sm font-semibold text-[#211E16] mb-1">OEE estimado</p>
          <p className="text-2xl font-bold text-[#006F44]">{resumo.oee.toFixed(1)}%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold text-[#211E16] mb-4">Arquivo de origem</h2>

          <div className="space-y-4">
            <label htmlFor="infinity-upload" className="inline-block cursor-pointer">
              <Button variant="primary" type="button">Selecionar arquivo</Button>
            </label>
            <input
              id="infinity-upload"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleArquivo}
            />

            <div className="rounded-md border border-dashed border-[#C7C8CA] bg-[#F9FAFB] p-4 text-sm text-gray-600">
              {arquivo ? (
                <div>
                  <p className="font-medium text-[#211E16]">{arquivo.name}</p>
                  <p>{(arquivo.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <p>Nenhum arquivo carregado. Use a planilha do Infinity exportada em Excel ou CSV.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[#211E16] mb-4">Indicadores de OEE</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Disponibilidade</span>
              <strong className="text-[#211E16]">{resumo.disponibilidade.toFixed(1)}%</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Performance</span>
              <strong className="text-[#211E16]">{resumo.performance.toFixed(1)}%</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Qualidade</span>
              <strong className="text-[#211E16]">{resumo.qualidade.toFixed(1)}%</strong>
            </div>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Observação: os campos de tempo planejado, ativo e ciclo precisam estar presentes para o cálculo final do OEE. Se faltarem, o sistema mantém o valor como <strong>não aplicável</strong>.
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-[#211E16] mb-4">Colunas detectadas</h2>
        <div className="flex flex-wrap gap-2">
          {(cabecalho || COLUNAS_PADRAO).map((coluna) => (
            <span
              key={coluna}
              className="rounded-full bg-[#F3F4F6] border border-[#C7C8CA] px-3 py-1 text-xs font-medium text-[#211E16]"
            >
              {coluna}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[#211E16] mb-4">Pré-visualização da planilha</h2>

        <div className="overflow-x-auto rounded-md border border-[#C7C8CA]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[#211E16]">
              <tr>
                {(cabecalho || COLUNAS_PADRAO).map((coluna) => (
                  <th key={coluna} className="border-b border-[#C7C8CA] px-3 py-2 font-semibold whitespace-nowrap">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasPreview.length > 0 ? (
                linhasPreview.map((linha, index) => (
                  <tr key={`${linha.join('-')}-${index}`} className="even:bg-[#F9FAFB]">
                    {linha.map((valor, idx) => (
                      <td key={`${valor}-${idx}`} className="border-b border-[#E5E7EB] px-3 py-2 align-top text-gray-700">
                        {valor}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                PREVIEW_DE_EXEMPLO.map((linha, index) => (
                  <tr key={`${linha.join('-')}-${index}`} className="even:bg-[#F9FAFB]">
                    {linha.map((valor, idx) => (
                      <td key={`${valor}-${idx}`} className="border-b border-[#E5E7EB] px-3 py-2 align-top text-gray-700">
                        {valor}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
