/**
 * End-to-end check of the full guest cash-on-delivery journey in a real browser:
 * home -> search -> product -> add to cart -> cart -> checkout -> review -> place order ->
 * confirmation -> track order. After the browser steps, the script checks the database:
 * the order, its items, the stock reservation and the emptied cart.
 *
 * Requirements: the Laravel API and this storefront are running, and the database is reachable.
 *   STOREFRONT_URL   default http://localhost:3000
 *   E2E_DB_HOST, E2E_DB_PORT, E2E_DB_NAME, E2E_DB_USER, E2E_DB_PASSWORD (defaults match the local .env example)
 *   E2E_PRODUCT      product name to search for (default "Fleece Hoodie")
 *
 * Run: npm run test:e2e   (exit code 0 = all checks passed)
 */
import { chromium } from 'playwright';
import mysql from 'mysql2/promise';
import { mkdirSync } from 'node:fs';

const BASE = process.env.STOREFRONT_URL ?? 'http://localhost:3000';
const PRODUCT = process.env.E2E_PRODUCT ?? 'Fleece Hoodie';
const OUT = new URL('./artifacts/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const db = await mysql.createConnection({
  host: process.env.E2E_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.E2E_DB_PORT ?? 3306),
  database: process.env.E2E_DB_NAME ?? 'cartix',
  user: process.env.E2E_DB_USER ?? 'cartix',
  password: process.env.E2E_DB_PASSWORD ?? '',
});

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};
const BENGALI = /[\u0980-\u09FF]/; // Bengali Unicode block

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// Any image that fails to load (for example refused by the image optimizer) fails the run.
const brokenImages = [];
page.on('response', (r) => {
  if (r.request().resourceType() === 'image' && r.status() >= 400) brokenImages.push(`${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) => {
  if (r.resourceType() === 'image') brokenImages.push(`failed ${r.url()}`);
});

async function assertEnglish(label) {
  const text = await page.locator('body').innerText();
  check(!BENGALI.test(text), `${label}: page text contains no Bengali characters`);
}

try {
  // 1. Home
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check((await page.title()).includes('Cartix'), 'home page loads with the Cartix title');
  check(await page.getByRole('heading', { name: 'Featured' }).isVisible(), 'home page shows the Featured section from the API');
  await assertEnglish('home');

  // 2. Search
  await page.getByRole('searchbox', { name: 'Search products' }).first().fill(PRODUCT);
  await page.getByRole('searchbox', { name: 'Search products' }).first().press('Enter');
  await page.waitForURL(/\/search\?q=/);
  await page.getByRole('link', { name: PRODUCT }).first().click();
  await page.waitForURL(/\/product\//);
  await page.getByRole('heading', { level: 1, name: PRODUCT }).waitFor({ timeout: 10000 }).catch(() => undefined);
  check(await page.getByRole('heading', { level: 1, name: PRODUCT }).isVisible(), 'search leads to the product page');
  await assertEnglish('product');

  // 3. Add two items to the cart
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  const addRequest = page.waitForRequest((r) => r.url().endsWith('/api/cart/items') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const added = JSON.parse((await addRequest).postData() ?? '{}');
  await page.getByText('Added to your cart.').waitFor();
  check(added.quantity === 2 && Number.isInteger(added.variant_id), `added variant ${added.variant_id} with quantity 2`);
  check(await page.getByRole('link', { name: 'Cart, 2 items' }).isVisible(), 'header cart count shows 2 items');
  const cookies = await context.cookies();
  const cartCookie = cookies.find((c) => c.name === 'cartix_cart');
  check(Boolean(cartCookie?.httpOnly), 'cart token is stored in an httpOnly cookie');

  const [[before]] = await db.query('SELECT quantity, reserved_quantity FROM inventories WHERE variant_id = ?', [added.variant_id]);
  const [[{ maxId }]] = await db.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM orders');

  // 4. Cart
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
  check(await page.getByRole('link', { name: PRODUCT }).isVisible(), 'cart lists the product');
  await assertEnglish('cart');
  await page.screenshot({ path: `${OUT}cart.png`, fullPage: true });
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await page.waitForURL(/\/checkout/);

  // 5. Checkout form
  await page.getByLabel('Full name').fill('Rakib Hasan');
  await page.getByLabel('Mobile number', { exact: true }).fill('01712345678');
  await page.getByLabel('Division', { exact: true }).selectOption({ label: 'Dhaka' });
  await page.getByLabel('District', { exact: true }).selectOption({ label: 'Dhaka' });
  await page.getByLabel('Area, upazila or thana').fill('Mirpur');
  await page.getByLabel('Address', { exact: true }).fill('House 12, Road 5, Block C');
  // Wait for the server quote (delivery charge and total) for the chosen district.
  await page.waitForFunction(() => {
    const totals = [...document.querySelectorAll('aside[aria-label="Order summary"] dl dd')];
    return totals.length > 0 && totals[totals.length - 1].textContent.startsWith('Tk');
  });
  await assertEnglish('checkout');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  // 6. Review and place the order
  await page.getByRole('heading', { name: 'Review your order' }).waitFor();
  const placeButton = page.getByRole('button', { name: /Place order/ });
  check(await placeButton.isDisabled(), 'place order is disabled until the details are confirmed');
  await page.getByLabel('I confirm that my order and delivery details are correct.').check();
  await page.screenshot({ path: `${OUT}review.png`, fullPage: true });
  const buttonText = await placeButton.innerText();
  const shownTotal = buttonText.match(/Tk ([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g, '');
  const checkoutResponse = page.waitForResponse((r) => r.url().endsWith('/api/checkout'));
  // Two quick clicks: the second must not create a second order.
  await placeButton.click();
  await placeButton.click({ force: true, trial: false }).catch(() => undefined);
  const res = await checkoutResponse;
  check(res.status() === 201, `checkout responded 201 (got ${res.status()})`);

  // 7. Confirmation
  await page.waitForURL(/\/order\/CX-/);
  await page.getByRole('heading', { name: 'Thank you, your order has been placed' }).waitFor();
  const orderNumber = decodeURIComponent(page.url().match(/\/order\/([^?]+)/)[1]);
  check(/^CX-\d{4}-\d{6}$/.test(orderNumber), `confirmation shows order ${orderNumber}`);
  await assertEnglish('confirmation');
  await page.screenshot({ path: `${OUT}confirmation.png`, fullPage: true });

  // 8. Database checks
  const [orders] = await db.query(
    'SELECT id, status, payment_method, payment_status, grand_total, customer_phone, ip_address, ship_district_name, ship_upazila_name FROM orders WHERE order_number = ?',
    [orderNumber],
  );
  const order = orders[0];
  check(orders.length === 1, 'exactly one order row exists for this order number');
  check(order?.status === 'pending' && order?.payment_method === 'cod' && order?.payment_status === 'unpaid', 'order is pending, cash on delivery, unpaid');
  check(Number(order?.grand_total) === Number(shownTotal), `stored total ${order?.grand_total} equals the confirmed total ${shownTotal}`);
  check(order?.customer_phone === '01712345678' && order?.ship_district_name === 'Dhaka' && order?.ship_upazila_name === 'Mirpur', 'customer and address snapshots are stored');
  check(Boolean(order?.ip_address), 'order IP address is recorded');
  const [items] = await db.query('SELECT variant_id, quantity, product_name FROM order_items WHERE order_id = ?', [order.id]);
  check(items.length === 1 && items[0].variant_id === added.variant_id && items[0].quantity === 2 && items[0].product_name === PRODUCT, 'order item snapshot matches the cart');
  const [[after]] = await db.query('SELECT quantity, reserved_quantity FROM inventories WHERE variant_id = ?', [added.variant_id]);
  check(after.reserved_quantity === before.reserved_quantity + 2 && after.quantity === before.quantity, `stock reserved: ${before.reserved_quantity} -> ${after.reserved_quantity}, on hand unchanged at ${after.quantity}`);
  const [[reservation]] = await db.query(
    "SELECT COUNT(*) AS n FROM inventory_reservations r JOIN order_items i ON i.id = r.order_item_id WHERE i.order_id = ? AND r.status = 'active'",
    [order.id],
  );
  check(Number(reservation.n) === 1, 'an active reservation exists for the order item');
  const [[duplicates]] = await db.query('SELECT COUNT(*) AS n FROM orders WHERE id > ?', [maxId]);
  check(Number(duplicates.n) === 1, 'the double click created only one order');
  check(await page.getByRole('link', { name: 'Cart, empty' }).isVisible(), 'cart is empty after the order');

  // 9. Track order with order number and phone
  await page.goto(`${BASE}/track-order`, { waitUntil: 'networkidle' });
  await page.getByLabel('Order number').fill(orderNumber);
  await page.getByLabel('Mobile number').fill('+880 1712-345678');
  await page.getByRole('button', { name: 'Find order' }).click();
  await page.getByRole('heading', { name: `Order ${orderNumber}` }).waitFor();
  check(await page.getByText('017*****678').first().isVisible(), 'order lookup shows the masked phone number');
  await page.getByLabel('Mobile number').fill('01812345678');
  await page.getByRole('button', { name: 'Find order' }).click();
  const refused = await page.getByText('We could not find an order with these details.').waitFor({ timeout: 10000 }).then(() => true, () => false);
  check(refused, 'lookup with the wrong phone is refused');
  await assertEnglish('track order');

  check(brokenImages.length === 0, `every image loaded${brokenImages.length ? `: ${brokenImages.slice(0, 3).join(' | ')}` : ''}`);
  check(pageErrors.length === 0, `no JavaScript errors in the browser${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
} catch (e) {
  failures++;
  console.error('FAIL  journey stopped:', e.message);
  await page.screenshot({ path: `${OUT}failure.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  await db.end();
}

console.log(failures === 0 ? '\nAll end-to-end checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
