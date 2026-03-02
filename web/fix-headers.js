const fs = require('fs');
const glob = require('glob'); // npm package or just simple recursiv readdir

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('page.js') || file.endsWith('ArchiveBrowser.js')) results.push(file);
        }
    });
    return results;
}

const files = walk('c:/Users/hoon/Desktop/els_home_v1/web/app/employees');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('className={styles.headerBanner}') && content.includes('className={styles.controls}')) {
        let lines = content.split('\n');
        let bannerIdx = -1, bannerEnd = -1, controlsStart = -1, controlsEnd = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<div className={styles.headerBanner}>')) bannerIdx = i;
            if (bannerIdx !== -1 && lines[i].includes('</h1')) bannerEnd = i + 1;
            if (lines[i].includes('className={styles.controls}')) controlsStart = i;
        }

        if (bannerIdx !== -1 && controlsStart !== -1 && controlsStart === bannerEnd + 1) {
            let divCount = 0;
            for (let i = controlsStart; i < lines.length; i++) {
                divCount += (lines[i].match(/<div/g) || []).length;
                divCount -= (lines[i].match(/<\/div/g) || []).length;
                if (divCount === 0) {
                    controlsEnd = i;
                    break;
                }
            }
            if (controlsEnd !== -1) {
                // remove the </div> at bannerEnd
                lines.splice(bannerEnd, 1);
                // insert </div> at controlsEnd
                lines.splice(controlsEnd, 0, '            </div>');
                fs.writeFileSync(file, lines.join('\n'));
                console.log('Fixed', file);
            }
        }
    }
});
