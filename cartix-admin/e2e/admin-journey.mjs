/**
 * Admin regression check in a real browser: Vite dev server -> Laravel API -> MySQL.
 * Requires the API and `npm run dev` to be running, the seeded admin account and at least one
 * pending order (the demo seeder creates some; the storefront end-to-end test adds another).
 *   ADMIN_URL       default http://127.0.0.1:5173
 *   ADMIN_PHONE     default 01700000000
 *   ADMIN_PASSWORD  the CARTIX_ADMIN_PASSWORD used when seeding (required)
 * Run: ADMIN_PASSWORD=... npm run test:e2e
 * It changes the database it runs against (confirms and ships an order, adds stock, creates a product,
 * a category and a coupon), so use local or test data only.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = new URL('./artifacts', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const BASE = process.env.ADMIN_URL ?? 'http://127.0.0.1:5173';
const PHONE = process.env.ADMIN_PHONE ?? '01700000000';
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the seeded admin password.');
  process.exit(2);
}
const stamp = Date.now().toString(36).toUpperCase();
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const BENGALI = /[\u0980-\u09FF]/; // Bengali Unicode block

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
// Resource failures are checked by URL below; the console only repeats them without the address.
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('response', (r) => {
  const expected = r.status() === 422 && r.url().endsWith('/api/admin/login'); // the deliberate wrong password
  if (r.status() >= 400 && !expected) errors.push(`${r.status()} ${r.url()}`);
});
// Web fonts are optional; a blocked font host must not fail the check.
page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push(`failed ${r.url()}`); });

const englishOnly = async (label) => check(`${label}: no Bengali text`, !BENGALI.test(await page.locator('body').innerText()));
const toast = async (text) => page.locator('.toast', { hasText: text }).waitFor({ timeout: 10000 }).then(() => true, () => false);
const go = async (label) => {
  await page.locator('#main-menu').getByRole('link', { name: label, exact: true }).click();
  await page.waitForLoadState('networkidle');
};

try {
  // 1. Login: wrong, then right
  await page.goto(BASE + '/login');
  await page.fill('#phone', PHONE);
  await page.fill('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]');
  check('wrong password shows error', (await page.textContent('[role=alert]')).includes('incorrect'));

  await page.fill('#phone', '+880 1700-000000');
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector("text=Today's business at a glance");
  await page.waitForLoadState('networkidle');
  check('login with +880 format reaches dashboard', page.url() === BASE + '/');

  // 2. Dashboard and sidebar
  await page.waitForSelector('.kpi .label');
  const kpiLabels = await page.$$eval('.kpi .label', (els) => els.map((e) => e.textContent));
  check('dashboard shows sales, profit, pending and low stock', ['Sales today', 'Gross profit today', 'Pending orders', 'Low stock items'].every((l) => kpiLabels.includes(l)), JSON.stringify(kpiLabels));
  check('quick actions shown', await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link').count() >= 4);
  const groups = await page.$$eval('.nav-group-head span:first-child', (els) => els.map((e) => e.textContent));
  check('sidebar groups for a super admin', JSON.stringify(groups) === JSON.stringify(['Overview', 'Sales & Fulfillment', 'Catalog Management', 'Customers & Marketing', 'Business & Analytics', 'System Management']), JSON.stringify(groups));
  await page.getByRole('button', { name: 'Catalog Management' }).click();
  check('sidebar group collapses', (await page.locator('#nav-catalog').count()) === 0);
  await page.getByRole('button', { name: 'Catalog Management' }).click();
  await englishOnly('dashboard');
  await page.screenshot({ path: `${out}/a1-dashboard.png`, fullPage: true });

  // 3. Orders: pending filter, confirm by phone, ship
  await go('Orders');
  await page.waitForSelector('table tbody tr');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/admin/orders?') && r.url().includes('status=pending')),
    page.click('.chip:text-is("New")'),
  ]);
  await page.waitForSelector('table tbody tr td a');
  const pendingRows = await page.$$eval('table tbody tr', (r) => r.length);
  check('pending filter shows rows', pendingRows >= 1, `rows=${pendingRows}`);
  await page.click('table tbody tr >> nth=0');
  await page.waitForSelector('text=Next step');
  const orderNo = (await page.textContent('h1'))?.trim();
  await page.fill('#note', 'Confirmed on the phone');
  await page.click('button:has-text("Confirmed by phone")');
  await page.waitForSelector('[role=status]');
  check(`confirm ${orderNo}`, (await page.textContent('.page-head .badge')).includes('Confirmed'));
  await page.click('section button:text-is("Shipped")');
  check('ship the order', await page.locator('section .page-head .badge', { hasText: 'Shipped' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false));

  // 4. Products: filters and edit page
  await go('Products');
  await page.waitForSelector('table tbody tr');
  await page.selectOption('#f-stock', 'in');
  await page.waitForLoadState('networkidle');
  check('stock filter updates the URL', page.url().includes('stock=in'));
  await page.locator('table tbody tr').first().getByRole('link').first().click();
  await page.waitForSelector('h2:text-is("Details")');
  await page.fill('#short', `Updated by the admin check ${stamp}.`);
  await page.click('button:text-is("Save details")');
  check('product details saved', await toast('Product details saved.'));

  // Photo upload: a PNG made from a screenshot of a plain page area
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 500 } });
  await page.setInputFiles('#img-files', { name: 'e2e-photo.png', mimeType: 'image/png', buffer: png });
  await page.click('button:text-is("Upload 1 photo")');
  check('product photo uploaded', await toast('1 photo uploaded.'));
  await englishOnly('product edit');
  await page.screenshot({ path: `${out}/a2-product-edit.png`, fullPage: true });

  // 5. Inventory: adjust stock with a note and see the history
  await go('Inventory');
  await page.waitForSelector('table tbody tr');
  await page.locator('table tbody tr').first().getByRole('button', { name: /Adjust/ }).click();
  await page.locator('input[id^=chg-]').first().fill('7');
  await page.locator('input[id^=note-]').first().fill(`Supplier batch ${stamp}`);
  await page.locator('form[aria-label^="Adjust stock"] button:text-is("Save")').click();
  check('stock adjusted', await toast('Added 7 to stock.'));
  const historyOk = await page.getByRole('cell', { name: `Supplier batch ${stamp}`, exact: true }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  if (!historyOk) await page.screenshot({ path: `${out}/debug-history.png`, fullPage: true });
  check('stock history shows the change', historyOk);

  // 6. New product: lands on the edit page to add photos
  await page.goto(BASE + '/products/new');
  await page.waitForSelector('#name');
  const productName = `E2E Winter Hoodie ${stamp}`;
  await page.fill('#name', productName);
  await page.selectOption('#cat', { label: 'Hoodies' });
  await page.fill('#price', '1350');
  await page.fill('#cost', '800');
  await page.click('[aria-label="Sizes"] >> text="M"');
  await page.click('[aria-label="Sizes"] >> text="L"');
  await page.click('[aria-label="Colors"] >> text=Black');
  await page.click('[aria-label="Colors"] >> text=Navy');
  check('variant count shows 4', (await page.locator('.field:has-text("Variants to create") .num').textContent()) === '4');
  await page.click('button:has-text("Save product")');
  await page.waitForSelector(`h1:text-is("${productName}")`);
  check('new product opens its edit page', await page.getByText('Product saved. Now add photos').isVisible());
  check('new product has 4 variants', (await page.locator('section[aria-labelledby="variants-title"] tbody tr').count()) === 4);

  // Several photos at once; the color is picked from each file name.
  const shot = async (color) => {
    await page.evaluate((c) => { document.body.dataset.shotColor = c; }, color);
    return page.screenshot({ clip: { x: 300, y: 200, width: 400, height: 500 } });
  };
  await page.setInputFiles('#img-files', [
    { name: 'winter-hoodie-black.png', mimeType: 'image/png', buffer: await shot('black') },
    { name: 'winter-hoodie-navy.png', mimeType: 'image/png', buffer: await shot('navy') },
    { name: 'winter-hoodie-detail.png', mimeType: 'image/png', buffer: await shot('detail') },
  ]);
  const picked = await page.$$eval('select[id^="new-color-"]', (els) => els.map((e) => e.selectedOptions[0]?.textContent));
  check('color picked from each file name', JSON.stringify(picked) === JSON.stringify(['Black', 'Navy', 'All colors']), JSON.stringify(picked));
  await page.click('button:text-is("Upload 3 photos")');
  check('three photos uploaded at once', await toast('3 photos uploaded.'));
  check('gallery shows the three photos', (await page.locator('section[aria-labelledby="images-title"] .gallery').first().locator('figure').count()) === 3);
  const productUrl = page.url();

  // The shop shows the chosen color's photos.
  const slug = await page.inputValue('#slug');
  const shop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const shopBroken = [];
  shop.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) shopBroken.push(`${r.status()} ${r.url()}`); });
  await shop.goto(`${process.env.STOREFRONT_URL ?? 'http://localhost:3000'}/product/${slug}`, { waitUntil: 'networkidle' });
  const mainSrc = () => shop.locator('.card.relative img').first().getAttribute('src');
  const thumbs = () => shop.getByRole('list', { name: 'Product images' }).getByRole('listitem').count();
  await shop.getByRole('button', { name: 'Navy', exact: true }).click();
  const navySrc = await mainSrc();
  const navyThumbs = await thumbs();
  await shop.getByRole('button', { name: 'Black', exact: true }).click();
  const blackSrc = await mainSrc();
  check('shop switches photos by color', Boolean(navySrc && blackSrc && navySrc !== blackSrc) && navyThumbs === 2, `${navySrc} | ${blackSrc} | thumbs=${navyThumbs}`);
  // The uploaded photo must really display, not only have an address.
  await shop.waitForFunction(() => {
    const img = document.querySelector('.card.relative img');
    return img instanceof HTMLImageElement && img.complete;
  }, null, { timeout: 15000 }).catch(() => undefined);
  const shown = await shop.locator('.card.relative img').first().evaluate((img) => img.naturalWidth);
  check('uploaded photo displays in the shop', shown > 0 && shopBroken.length === 0, `width=${shown} ${shopBroken.join(' | ')}`);
  await shop.goto(`${process.env.STOREFRONT_URL ?? 'http://localhost:3000'}/category/hoodies`, { waitUntil: 'networkidle' });
  check('category page images load', shopBroken.length === 0, shopBroken.slice(0, 3).join(' | '));
  await shop.close();
  await page.goto(productUrl);

  // 7. Categories & Brands
  await go('Categories & Brands');
  await page.click('button:text-is("+ New category")');
  await page.fill('#c-name', `E2E Category ${stamp}`);
  await page.click('button:text-is("Save category")');
  check('category created', await toast('Category created.'));
  await page.getByRole('tab', { name: 'Brands' }).click();
  await page.waitForSelector('table tbody tr');
  check('brands tab lists brands', (await page.locator('table tbody tr').count()) >= 1);

  // 8. Attributes
  await go('Attributes');
  await page.getByRole('heading', { name: 'Color', exact: true }).waitFor();
  check('attributes page shows sizes and colors', await page.getByRole('heading', { name: 'Size', exact: true }).isVisible());

  // 9. Coupons
  await go('Coupons & Promotions');
  await page.click('button:text-is("+ New coupon")');
  await page.fill('#cp-code', `E2E${stamp}`);
  await page.fill('#cp-value', '10');
  await page.fill('#cp-max', '150');
  await page.click('button:text-is("Save coupon")');
  check('coupon created', await toast('Coupon created.'));
  check('coupon listed as live', await page.locator('tr', { hasText: `E2E${stamp}` }).locator('.badge', { hasText: 'Live' }).waitFor({ timeout: 10000 }).then(() => true, () => false));

  // 10. Customers
  await go('Customers');
  await page.waitForSelector('table tbody tr');
  await page.locator('table tbody tr').first().getByRole('link').click();
  await page.waitForSelector('h2:text-is("Last delivery address")');
  check('customer detail shows orders', (await page.locator('section[aria-labelledby="ord-title"] tbody tr').count()) >= 1);

  // 11. Reports
  await go('Reports & Analytics');
  await page.waitForSelector('.kpi .label:text-is("Gross profit")');
  check('report separates sales and profit', await page.locator('.kpi .label:text-is("Gross sales")').isVisible());
  await englishOnly('reports');
  await page.screenshot({ path: `${out}/a3-reports.png`, fullPage: true });

  // 12. Shipping: close and reopen one district
  await go('Shipping & Locations');
  await page.waitForSelector('text=Delivery coverage');
  // Works from either starting state: toggle, check, then put it back.
  const bandarban = page.locator('label', { hasText: 'Bandarban' }).locator('input');
  const wasOpen = await bandarban.isChecked();
  await bandarban.click();
  const first = wasOpen ? 'closed' : 'opened';
  check(`district ${first} for delivery`, await toast(`Bandarban ${first} for delivery.`) && (await bandarban.isChecked()) !== wasOpen);
  await page.locator('.toast').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
  await bandarban.click();
  check('district restored', await toast(`Bandarban ${wasOpen ? 'opened' : 'closed'} for delivery.`) && (await bandarban.isChecked()) === wasOpen);
  if (!wasOpen) {
    // Leave every district open, as the demo data has it.
    await page.locator('.toast').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    await bandarban.click();
    await toast('Bandarban opened for delivery.');
  }

  // 13. Staff and activity
  await go('Staff & Permissions');
  check('staff list shows the signed-in admin', await page.getByText('(you)').waitFor({ timeout: 10000 }).then(() => true, () => false));
  await go('Activity Logs');
  await page.waitForSelector('table tbody tr');
  const logged = await page.locator('tbody td', { hasText: 'Order confirmed' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  if (!logged) await page.screenshot({ path: `${out}/debug-activity.png`, fullPage: true });
  check('activity log records the order confirmation', logged);
  await englishOnly('activity');

  // 14. Mobile layout
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(BASE + '/login');
  await m.fill('#phone', PHONE);
  await m.fill('#password', PASSWORD);
  await m.click('button[type=submit]');
  await m.waitForSelector("text=Today's business at a glance");
  await m.waitForLoadState('networkidle');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('mobile: no horizontal page scroll', !overflow);
  check('mobile: menu hidden until opened', !(await m.locator('#main-menu').isVisible()));
  await m.getByRole('button', { name: 'Menu' }).click();
  check('mobile: menu opens', await m.locator('#main-menu').isVisible());
  await m.screenshot({ path: `${out}/a4-mobile-menu.png`, fullPage: true });
  await m.locator('#main-menu').getByRole('link', { name: 'Inventory' }).click();
  await m.waitForSelector('h1:text-is("Inventory")');
  check('mobile: menu closes after navigating', !(await m.locator('#main-menu').isVisible()));
  await m.close();

  // 15. Logout
  await page.click('button:has-text("Log out")');
  await page.waitForURL(BASE + '/login');
  check('logout returns to login', true);
} catch (e) {
  check('journey completed', false, String(e).split('\n')[0]);
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => undefined);
}

check('no browser errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
