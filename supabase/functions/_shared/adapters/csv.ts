// RFC4180 相当の最小 CSV パーサ (引用符・埋め込み改行・"" エスケープに対応)。
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  endRow();
  return rows;
}

// ヘッダ名 -> 列 index。表記ゆれ (全角空白・BOM) を吸収する。
export function headerIndex(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const key = name.replace(/^\uFEFF/, "").replace(/[\s　]/g, "");
    if (key) index[key] = i;
  });
  return index;
}
