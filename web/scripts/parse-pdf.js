const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const WORK_DOCS_DIR = path.join(__dirname, '../../work-docs');
const OUTPUT_FILE = path.join(__dirname, '../data/safe-freight-docs.json');

async function parseAllPdfs() {
  const result = [];
  
  if (!fs.existsSync(WORK_DOCS_DIR)) {
    console.error('work-docs directory not found:', WORK_DOCS_DIR);
    return;
  }

  const dirs = fs.readdirSync(WORK_DOCS_DIR);
  
  for (const dir of dirs) {
    if (dir.startsWith('안전운임_')) {
      const fullDirPath = path.join(WORK_DOCS_DIR, dir);
      const stat = fs.statSync(fullDirPath);
      
      if (stat.isDirectory()) {
        const files = fs.readdirSync(fullDirPath);
        
        for (const file of files) {
          if (file.endsWith('.pdf') && file.includes('고시')) {
            const filePath = path.join(fullDirPath, file);
            console.log(`Parsing PDF: ${filePath}`);
            
            try {
              const dataBuffer = fs.readFileSync(filePath);
              const data = await pdfParse(dataBuffer);
              
              result.push({
                versionDir: dir,
                filename: file,
                text: data.text,
                parsedAt: new Date().toISOString()
              });
            } catch (err) {
              console.error(`Failed to parse ${file}:`, err);
            }
          }
        }
      }
    }
  }

  const dataDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Successfully saved ${result.length} PDF documents to ${OUTPUT_FILE}`);
}

parseAllPdfs();
