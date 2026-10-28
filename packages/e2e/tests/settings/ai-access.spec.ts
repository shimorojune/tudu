import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { API_URL, codeFor, enterCode, expect, freshEmail, signInFresh, test } from '../../fixtures/app';

const project = () => test.info().project.name;
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

/** An app registering itself (DCR) the way Claude does, with a public client and PKCE. */
async function registerClaude(page: Page): Promise<string> {
  const res = await page.request.post(`${API_URL}/api/auth/oauth2/register`, {
    data: {
      client_name: 'Claude',
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { client_id: string }).client_id;
}

/** The authorize address an app sends you to, for the MCP server the API names. */
async function authorizeUrl(page: Page, clientId: string, mcpUrl: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: 'offline_access',
    state: 'st-e2e',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: mcpUrl,
  });
  return `${API_URL}/api/auth/oauth2/authorize?${q}`;
}

/** Where the app hears back: the callback is answered here, never fetched. */
async function catchCallback(page: Page): Promise<() => URL | null> {
  let hit: URL | null = null;
  await page.route('https://claude.ai/**', async (route) => {
    hit = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>back at the app</p>' });
  });
  return () => hit;
}

test.describe('AI access', () => {
  test('MCP-E01 nothing yet; make a key with Read and write; it shows once with Claude Code and Cursor; Copy', async ({
    page,
    context,
  }) => {
    test.skip(project() !== 'desktop', 'the dialog, once');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await signInFresh(page);
    await page.goto('/me?settings=ai');
    const d = dialog(page);
    await expect(d.getByRole('heading', { level: 1 })).toHaveText('AI access');
    await expect(d.getByText('Nothing yet. Apps you allow show up here.')).toBeVisible();
    await d.getByRole('button', { name: 'New key' }).click();
    const k = page.getByRole('dialog', { name: 'New API key' });
    await k.getByLabel('Key name').fill('Claude Code on my Mac');
    await k.getByRole('button', { name: 'Read and write' }).click();
    await k.getByRole('button', { name: 'Create key' }).click();
    const reveal = page.getByRole('dialog', { name: 'Copy your key' });
    const key = reveal.getByLabel('Your new API key');
    await expect(key).toHaveText(/^tudu_/);
    const secret = (await key.textContent())!;
    await expect(reveal.getByLabel('Command for Claude Code')).toContainText(`Bearer ${secret}`);
    await reveal.getByRole('button', { name: 'Cursor' }).click();
    await expect(reveal.getByLabel('Settings for Cursor')).toContainText('"mcpServers"');
    await reveal.locator('.tp-ai-secret').getByRole('button', { name: 'Copy' }).click();
    await expect(reveal.locator('.tp-ai-secret').getByRole('button', { name: /Copied/ })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) expect(copied).toBe(secret);

    // The key works on the API as its person, read and write.
    const res = await page.request.get(`${API_URL}/api/access`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(res.ok()).toBe(true);
    expect(((await res.json()) as { access: { level: string } }).access.level).toBe('write');
  });

  test('MCP-E02 Done lists the key; Revoke asks, then the row goes; with the API down it says so and stays', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'the dialog, once');
    await signInFresh(page);
    await page.goto('/me?settings=ai');
    const d = dialog(page);
    for (const name of ['Script one', 'Script two']) {
      await d.getByRole('button', { name: 'New key' }).click();
      await page.getByRole('dialog', { name: 'New API key' }).getByLabel('Key name').fill(name);
      await page.getByRole('button', { name: 'Create key' }).click();
      await page.getByRole('dialog', { name: 'Copy your key' }).getByRole('button', { name: 'Done' }).click();
      await expect(d.getByText(name, { exact: true })).toBeVisible();
    }
    const row = (name: string) => d.locator('.tp-set-sprow', { hasText: name });
    await expect(row('Script one')).toContainText(
      'Can only read all your spaces and your Notebook · not used yet',
    );

    await page.route('**/api/keys/*', (route) =>
      route.request().method() === 'DELETE' ? route.abort('connectionfailed') : route.fallback(),
    );
    await row('Script one').getByRole('button', { name: 'Revoke' }).click();
    const ask = page.getByRole('dialog', { name: 'Revoke Script one?' });
    await expect(ask).toContainText('Anything using this key stops working right away');
    await ask.getByRole('button', { name: 'Revoke key' }).click();
    await expect(ask.getByRole('alert')).toHaveText(
      'Couldn’t revoke the key. Check your connection and try again. It still works until it’s revoked.',
    );
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(row('Script one')).toBeVisible();

    await page.unroute('**/api/keys/*');
    await row('Script one').getByRole('button', { name: 'Revoke' }).click();
    await page
      .getByRole('dialog', { name: 'Revoke Script one?' })
      .getByRole('button', { name: 'Revoke key' })
      .click();
    await expect(row('Script one')).toHaveCount(0);
    await expect(row('Script two')).toBeVisible();
    await page.reload();
    await expect(dialog(page).getByText('Script one', { exact: true })).toHaveCount(0);
  });

  test('MCP-E03 an app connecting while signed out: code, consent with Only some, Allow, back to the app with a code', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'one OAuth run');
    const clientId = await registerClaude(page);
    const back = await catchCallback(page);
    await page.goto(await authorizeUrl(page, clientId, 'http://localhost:3457/mcp'));
    await expect(page).toHaveURL(/\/sign-in\?.*sig=/);
    const email = freshEmail('oauth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await enterCode(page, await codeFor(page, email));

    await expect(page).toHaveURL(/\/oauth\/consent\?/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Allow Claude?' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText('Read and write · All spaces · Notebook')).toBeVisible();
    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('button', { name: 'Only some' }).click();
    await expect(page.getByRole('button', { name: 'Allow' })).toBeDisabled();
    await page.getByRole('switch', { name: 'Personal' }).click();
    await page.getByRole('button', { name: 'Allow' }).click();
    await expect(page.getByRole('heading', { name: 'Claude is connected' })).toBeVisible();
    await expect.poll(back, { timeout: 10_000 }).not.toBeNull();
    expect(back()!.searchParams.get('code')).toBeTruthy();
    expect(back()!.searchParams.get('state')).toBe('st-e2e');

    // Settings lists it, verified, with what it may do.
    await page.goto('/me?settings=ai');
    const row = dialog(page).locator('.tp-set-sprow', { hasText: 'Claude' });
    await expect(row).toContainText('Can read and change Personal and your Notebook');
    await expect(row.locator('.tp-ai-mark-img')).toBeVisible();
    await expect(row.getByText('Unverified')).toHaveCount(0);
  });

  test('MCP-E04 a changed link says it didn’t work; Cancel goes back to the app with access_denied', async ({
    page,
  }) => {
    test.skip(project() !== 'desktop', 'one OAuth run');
    await signInFresh(page);
    await page.goto('/oauth/consent?client_id=nobody&exp=1&sig=changed');
    await expect(page.getByRole('heading', { name: 'This link didn’t work' })).toBeVisible();

    const clientId = await registerClaude(page);
    const back = await catchCallback(page);
    const apps = await page.request.get(`${API_URL}/api/apps`);
    const { url } = (await apps.json()) as { url: string };
    await page.goto(await authorizeUrl(page, clientId, url));
    await expect(page.getByRole('heading', { name: 'Allow Claude?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(back, { timeout: 10_000 }).not.toBeNull();
    expect(back()!.searchParams.get('error')).toBe('access_denied');
    await page.goto('/me?settings=ai');
    await expect(dialog(page).getByText('Nothing yet. Apps you allow show up here.')).toBeVisible();
  });

  test('MCP-E05 phone: Settings › AI access pushes in with ‹ Settings; the key sheet; the gutters match Apps', async ({
    page,
  }) => {
    test.skip(project() !== 'phone', 'phone only');
    await signInFresh(page);
    await page.goto('/me/settings');
    const item = page
      .getByRole('navigation', { name: 'Settings' })
      .getByRole('button', { name: /^AI access/ });
    await expect(item).toContainText('None yet');
    await item.click();
    await expect(page).toHaveURL(/\/me\/settings\/ai$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI access');
    const aiLeft = (await page.locator('.tp-set-ai .tp-setrow').first().boundingBox())!.x;
    await page.getByRole('button', { name: 'New key' }).click();
    const sheet = page.getByRole('dialog', { name: 'New API key' });
    await expect(sheet).toHaveClass(/tp-dlg-sheet/);
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/me\/settings$/);
    await page.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: /^Apps/ }).click();
    const appsLeft = (await page.locator('.tp-set-apps .tp-setrow').first().boundingBox())!.x;
    expect(Math.abs(aiLeft - appsLeft)).toBeLessThan(1);
  });
});
