const data = require('./data/safe-freight.json');
console.log(data.regions.map(r => r.id).filter(id => id.includes('편도')).slice(0, 10));
