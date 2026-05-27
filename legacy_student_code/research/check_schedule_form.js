const fs = require('fs');
const cheerio = require('cheerio');

function check() {
  const html = fs.readFileSync('/home/trieuhoa/lichhoc-app/schedule_page.html', 'utf8');
  const $ = cheerio.load(html);

  console.log('--- PHÂN TÍCH FORM/SELECT TRONG TRANG LỊCH HỌC ---');
  const selects = $('select');
  console.log(`Số lượng select box: ${selects.length}`);
  selects.each((i, el) => {
    const name = $(el).attr('name');
    const id = $(el).attr('id');
    console.log(`Select #${i+1}: name="${name}", id="${id}"`);
    const options = $(el).find('option');
    console.log(`  Số lượng option: ${options.length}`);
    options.slice(0, 10).each((j, opt) => {
      console.log(`    - Option [val="${$(opt).attr('value')}"] ${$(opt).text().trim()}${$(opt).attr('selected') ? ' (Selected)' : ''}`);
    });
  });

  const forms = $('form');
  console.log(`\nSố lượng form: ${forms.length}`);
  forms.each((i, el) => {
    console.log(`Form #${i+1}: action="${$(el).attr('action')}", method="${$(el).attr('method')}"`);
    $(el).find('input[type="hidden"]').each((j, inp) => {
      console.log(`  - Hidden: name="${$(inp).attr('name')}", value="${$(inp).attr('value')}"`);
    });
  });

  // Tìm các thẻ script
  console.log('\n--- CÁC SCRIPT LIÊN QUAN ĐẾN LỊCH HỌC ---');
  $('script').each((i, el) => {
    const src = $(el).attr('src');
    const content = $(el).html();
    if (src) {
      if (src.includes('lich') || src.includes('schedule') || src.includes('common')) {
        console.log(`Script Src #${i}: ${src}`);
      }
    } else if (content && (content.includes('HocKy') || content.includes('LichHoc') || content.includes('change') || content.includes('load'))) {
      console.log(`Script Inline #${i} (chứa từ khóa quan trọng):`);
      console.log(content.slice(0, 1000));
    }
  });
}

check();
