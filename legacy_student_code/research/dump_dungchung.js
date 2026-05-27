const fs = require('fs');
const cheerio = require('cheerio');

function dump() {
  const html = fs.readFileSync('/home/trieuhoa/lichhoc-app/schedule_page.html', 'utf8');
  const $ = cheerio.load(html);

  $('script').each((i, el) => {
    const content = $(el).html();
    if (content && content.includes('function DungChung()')) {
      console.log(`Script Inline #${i}:`);
      console.log(content);
    }
  });
}

dump();
