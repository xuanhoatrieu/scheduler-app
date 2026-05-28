const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
  });

  const page = await browser.newPage();
  
  // Intercept AJAX calls
  const ajaxCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json') || url.includes('api') || url.includes('Get') || url.includes('Load') || url.includes('Lich')) {
      try {
        const body = await response.text();
        ajaxCalls.push({ url: url.substring(0, 120), status: response.status(), size: body.length, snippet: body.substring(0, 200) });
      } catch (e) {}
    }
  });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  // Step 1: Go to GV → auto redirect to SSO
  console.log('1. Navigating to GV portal...');
  await page.goto('https://giangvien.tuaf.edu.vn', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('   URL:', page.url());

  // Step 2: Login SSO
  console.log('2. Logging in...');
  await page.waitForSelector('input[name="Username"]', { timeout: 10000 });
  await page.type('input[name="Username"]', 'xuanhoatrieu', { delay: 30 });
  await page.type('input[name="Password"]', 'xuanhoatrieu', { delay: 30 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"], button[name="button"]')
  ]);
  console.log('   After login URL:', page.url());

  // Step 3: Wait for GV portal to load
  console.log('3. Waiting for GV portal...');
  try {
    await page.waitForFunction(
      () => window.location.hostname === 'giangvien.tuaf.edu.vn' && !window.location.pathname.includes('signin-oidc'),
      { timeout: 15000 }
    );
  } catch (e) {
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('   Final URL:', page.url());

  // Step 4: Wait for full SPA render
  await new Promise(r => setTimeout(r, 5000));

  // Step 5: Get page structure
  const pageInfo = await page.evaluate(() => {
    const info = {
      title: document.title,
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 2000),
      tables: document.querySelectorAll('table').length,
      selects: Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id, name: s.name, 
        options: Array.from(s.options).map(o => o.value + ':' + o.text).slice(0, 10)
      })),
      links: Array.from(document.querySelectorAll('a[href]')).map(a => a.href).filter(h => h.includes('Lich') || h.includes('GiangVien') || h.includes('Home')).slice(0, 20),
      sessionKeys: Object.keys(sessionStorage),
      sessionData: (() => { try { return JSON.parse(sessionStorage.getItem('enjsufo') || '{}'); } catch(e) { return {}; } })()
    };
    return info;
  });

  console.log('\n=== PAGE INFO ===');
  console.log('Title:', pageInfo.title);
  console.log('URL:', pageInfo.url);
  console.log('Tables:', pageInfo.tables);
  console.log('Selects:', JSON.stringify(pageInfo.selects, null, 2));
  console.log('Nav links:', pageInfo.links);
  console.log('Session keys:', pageInfo.sessionKeys);
  console.log('Session data:', JSON.stringify(pageInfo.sessionData).substring(0, 500));
  console.log('\nBody text (first 1000):', pageInfo.bodyText.substring(0, 1000));

  console.log('\n=== AJAX CALLS ===');
  ajaxCalls.forEach(a => console.log(`  ${a.url} → ${a.status} (${a.size}b) | ${a.snippet.substring(0, 100)}`));

  await browser.close();
  console.log('\nDone!');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
