/**
 * work-docs/안전운임조회.xlsx 구조 파악 → web/data/safe-freight-data.json 생성
 * 실행: node scripts/read-safe-freight-xlsx.js (web 폴더에서)
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const workDocsDir = path.join(__dirname, '..', '..', 'work-docs');
const files = fs.readdirSync(workDocsDir);
const xlsxPath = path.join(workDocsDir, files.find(f => f.endsWith('.xlsx') && f !== 'container_list.xlsx'));

const wb = XLSX.readFile(xlsxPath);
const out = { sheetNames: wb.SheetNames, sheets: {} };

wb.SheetNames.forEach((name) => {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  out.sheets[name] = { rowCount: rows.length, firstRows: rows.slice(0, 15) };
});

const outDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'safe-freight-structure.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('Written safe-freight-structure.json');
