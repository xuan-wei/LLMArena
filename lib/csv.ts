// Minimal RFC-4180 CSV parser — handles quoted fields, embedded commas, newlines, and "" escapes
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field); field = "";
      } else if (ch === "\n") {
        row.push(field); field = "";
        if (row.some((f) => f.trim())) rows.push(row);
        row = [];
      } else if (ch === "\r") {
        // skip CR (handled by \n)
      } else {
        field += ch;
      }
    }
  }
  // Last field/row
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}
