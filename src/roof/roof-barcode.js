const C39 = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','*':'nwnnwnwnn'
};

export function code39(text, h = 34, narrow = 1.7, wide = 4.2) {
  const s = '*' + String(text).toUpperCase().replace(/[^0-9A-Z\-. ]/g, '') + '*';
  let x = narrow * 10, parts = [];
  for (const ch of s) {
    const pat = C39[ch] || C39['-'];
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) parts.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}" fill="#171d18"/>`);
      x += w;
    }
    x += narrow;
  }
  const W = x + narrow * 9;
  return `<svg viewBox="0 0 ${W.toFixed(1)} ${h + 13}" role="img" aria-label="Штрихкод ${text}">${parts.join('')}<text x="${(W / 2).toFixed(1)}" y="${h + 11}" font-family="JetBrains Mono,monospace" font-size="9" font-weight="700" text-anchor="middle" fill="#3d4a40">${text}</text></svg>`;
}