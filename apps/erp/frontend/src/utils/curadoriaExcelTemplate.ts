import * as XLSX from 'xlsx-js-style';

export function buildCuradoriaTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerStyle: XLSX.CellStyle = {
    fill: { fgColor: { rgb: '1F2937' } },
    font: { color: { rgb: 'FFFFFF' }, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: '374151' } },
      bottom: { style: 'thin', color: { rgb: '374151' } },
      left: { style: 'thin', color: { rgb: '374151' } },
      right: { style: 'thin', color: { rgb: '374151' } },
    },
  };

  const bodyStyle: XLSX.CellStyle = {
    alignment: { vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
      left: { style: 'thin', color: { rgb: 'D1D5DB' } },
      right: { style: 'thin', color: { rgb: 'D1D5DB' } },
    },
  };

  const headers = ['titulo', 'isbn', 'editora', 'genero_literario', 'quantidade', 'valor', 'desconto', 'desconto_percentual'];
  const sampleRows = [
    ['Dom Casmurro', '9788535902775', 'Principis', 'Literatura', 3, 49.9, 5, ''],
    ['Clean Code', '9780132350884', 'Prentice Hall', 'Tecnologia', 2, 199.9, '', 10],
    ['O Hobbit', '9788595084742', '', 'Fantasia', 5, 59.9, 0, ''],
  ];

  const itensSheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  itensSheet['!cols'] = [
    { wch: 38 },
    { wch: 20 },
    { wch: 24 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
  ];

  for (let c = 0; c < headers.length; c += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (itensSheet[cellRef]) {
      itensSheet[cellRef].s = headerStyle;
    }
  }

  for (let r = 1; r <= sampleRows.length; r += 1) {
    for (let c = 0; c < headers.length; c += 1) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (itensSheet[cellRef]) {
        itensSheet[cellRef].s = bodyStyle;
      }
    }
  }

  const instrucoes = [
    ['Campo', 'Obrigatório', 'Descrição'],
    ['titulo', 'Não', 'Título do livro. Se vazio, o sistema tenta preencher pelo ISBN.'],
    ['isbn', 'Sim', 'ISBN do livro (10 ou 13 dígitos)'],
    ['editora', 'Não', 'Nome da editora do livro. Se vazio, o sistema tenta buscar pelo ISBN.'],
    ['genero_literario', 'Sim*', 'Nome do gênero literário já cadastrado no sistema.'],
    ['quantidade', 'Sim', 'Quantidade de exemplares do livro (inteiro maior que zero).'],
    ['valor', 'Sim', 'Valor unitário do livro (R$).'],
    [
      'desconto',
      'Não',
      'Desconto unitário em reais (R$). Use esta coluna quando quiser informar o valor exato de desconto por livro.',
    ],
    [
      'desconto_percentual',
      'Não',
      'Desconto unitário em porcentagem (%). Se esta coluna estiver preenchida, ela será usada no lugar de "desconto".',
    ],
    [
      '*Gênero literário padrão',
      'Opcional no modal',
      'Se informar gênero literário padrão no modal, a coluna genero_literario pode ficar vazia.',
    ],
  ];
  const instrucoesSheet = XLSX.utils.aoa_to_sheet(instrucoes);
  instrucoesSheet['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 72 }];

  for (let c = 0; c < 3; c += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (instrucoesSheet[cellRef]) {
      instrucoesSheet[cellRef].s = headerStyle;
    }
  }
  for (let r = 1; r < instrucoes.length; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (instrucoesSheet[cellRef]) {
        instrucoesSheet[cellRef].s = bodyStyle;
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, itensSheet, 'itens');
  XLSX.utils.book_append_sheet(wb, instrucoesSheet, 'instrucoes');
  return wb;
}

