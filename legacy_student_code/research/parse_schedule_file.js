const fs = require('fs');
const cheerio = require('cheerio');

function parse() {
  const html = fs.readFileSync('/home/trieuhoa/lichhoc-app/schedule_page.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('Tiêu đề trang:', $('title').text().trim());
  
  const tables = $('table');
  console.log(`Số lượng table tìm thấy: ${tables.length}`);

  tables.each((tIdx, tableEl) => {
    console.log(`\n--- Bảng #${tIdx + 1} ---`);
    const headers = [];
    $(tableEl).find('thead tr th, tr th').each((hIdx, thEl) => {
      headers.push($(thEl).text().trim().replace(/\s+/g, ' '));
    });
    console.log('Headers:', headers);

    const rows = $(tableEl).find('tbody tr, tr');
    console.log(`Số lượng dòng (bao gồm header nếu không chia thead/tbody): ${rows.length}`);
    
    rows.slice(0, 10).each((rIdx, rowEl) => {
      const cells = [];
      $(rowEl).find('td').each((cIdx, tdEl) => {
        cells.push($(tdEl).text().trim().replace(/\s+/g, ' '));
      });
      if (cells.length > 0) {
        console.log(`Dòng #${rIdx}:`, cells);
      }
    });
  });
}

parse();
