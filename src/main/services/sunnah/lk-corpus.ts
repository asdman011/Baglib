import type { SunnahChapter, SunnahCollectionId } from '../../../shared/types/sunnah';

const columns = [
  'Chapter_Number', 'Chapter_English', 'Chapter_Arabic', 'Section_Number',
  'Section_English', 'Section_Arabic', 'Hadith_number', 'English_Hadith',
  'English_Isnad', 'English_Matn', 'Arabic_Hadith', 'Arabic_Isnad',
  'Arabic_Matn', 'Arabic_Comment', 'English_Grade', 'Arabic_Grade',
];

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
    } else if (character === '"' && !field && !closedQuote) {
      quoted = true;
    } else if (character === ',' || character === '\r' || character === '\n') {
      row.push(field);
      field = '';
      closedQuote = false;
      if (character !== ',') {
        if (row.some(value => value.length > 0)) rows.push(row);
        row = [];
        if (character === '\r' && input[index + 1] === '\n') index++;
      }
    } else {
      if (closedQuote) throw new Error('Invalid CSV quote');
      field += character;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length || closedQuote) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function value(text: string): string {
  return /^(?:nan|null)?$/i.test(text.trim()) ? '' : text;
}

function number(text: string): string {
  return value(text).trim().replace(/^(\d+)\.0+$/, '$1');
}

export function parseLkChapter(csv: string, collection: SunnahCollectionId, chapterNumber: number): SunnahChapter {
  const [header, ...rows] = parseCsv(csv);
  if (!header || header.length !== columns.length || header.some((name, index) => name.trim() !== columns[index])) {
    throw new Error('Unsupported LK corpus columns');
  }
  if (!rows.length || rows.length > 10000) throw new Error('Invalid chapter size');
  const records = rows.map((row, index) => {
    if (row.length !== columns.length || number(row[0]) !== String(chapterNumber)) {
      throw new Error(`Invalid chapter row ${index + 2}`);
    }
    return {
      id: `${collection}:${chapterNumber}:${index + 1}`,
      number: number(row[6]),
      section: { number: number(row[3]), title: { ar: value(row[5]), en: value(row[4]) } },
      text: {
        ar: { full: value(row[10]), isnad: value(row[11]), matn: value(row[12]) },
        en: { full: value(row[7]), isnad: value(row[8]), matn: value(row[9]) },
      },
      comment: value(row[13]),
      grade: { ar: value(row[15]), en: value(row[14]) },
    };
  });
  return {
    collection,
    number: chapterNumber,
    title: { ar: value(rows[0][2]), en: value(rows[0][1]) },
    hadithCount: records.length,
    hadiths: records,
  };
}
