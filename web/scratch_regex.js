const text = '5월 9일은 총 오더 몇대지?';
const dateMatch = text.match(/(\d{1,2})[\/.월\s]+(\d{1,2})일?/);
console.log('dateMatch 9일:', dateMatch ? dateMatch.slice(0, 3) : null);
