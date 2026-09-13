import { expect, test } from '@playwright/test';

test.describe('Ratib iteration-three Privy story', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto('/demo2');
		await page.waitForFunction(() => document.documentElement.classList.contains('demo-mode'));
	});

	test('uses the original deck language for the question-and-answer story', async ({ page }) => {
		await expect(page).toHaveTitle(/Ratib.*Privy made it buildable/i);
		await expect(
			page.getByRole('heading', { name: /Research found the workflow.*Privy made it buildable/i })
		).toBeVisible();
		await expect(page.locator('[data-slide]')).toHaveCount(10);
		await expect(page.getByText('27', { exact: true })).toBeAttached();
		await expect(page.getByText('20', { exact: true })).toBeAttached();
		await expect(page.getByText('35', { exact: true })).toHaveCount(0);
		await expect(page.getByText('119', { exact: true })).toHaveCount(0);
		await expect(page.locator('#gap .gap-node')).toHaveCount(6);
		await expect(
			page.getByRole('heading', {
				name: /What if one product connected.*the whole financial loop/i
			})
		).toBeAttached();
		await expect(
			page.getByRole('heading', { name: /Privy made that.*architecture possible/i })
		).toBeAttached();
		await expect(page.getByText('Ratib roles never grant signing authority.')).toBeAttached();
		await expect(page.getByRole('link', { name: /Enter Ratib/ })).toHaveAttribute('href', '/login');
	});

	test('separates competitor precedents from the Ratib product visual', async ({ page }) => {
		const patterns = page.locator('#patterns');
		await expect(patterns.getByText('Request + Mural', { exact: true })).toBeAttached();
		await expect(patterns.getByText('Safe + Fireblocks + Fordefi', { exact: true })).toBeAttached();
		await expect(patterns.getByText('Bitwave + Cryptio', { exact: true })).toBeAttached();
		await expect(patterns.getByText('Modern Treasury + Dfns', { exact: true })).toBeAttached();
		await expect(patterns.locator('.workspace-preview')).toHaveCount(0);
		await expect(page.locator('#product .workspace-preview')).toHaveCount(1);
		await expect(page.locator('.workspace-preview')).toHaveCount(1);
	});

	test('retains the original presentation controls and animation model', async ({ page }) => {
		const research = page.getByRole('heading', {
			name: /We mapped the system.*before building the product/i
		});
		await page.keyboard.press('ArrowDown');
		await expect(research).toBeInViewport();
		await expect(page.getByText('02 / 10')).toBeVisible();

		await page.keyboard.press('n');
		const notes = page.locator('.presenter-notes');
		await expect(notes).toHaveClass(/open/);
		await expect(page.getByText('00:12–00:30').last()).toBeVisible();
		await page.keyboard.press('n');
		await expect(notes).not.toHaveClass(/open/);

		await page.keyboard.press('PageDown');
		await expect(
			page.getByRole('heading', { name: /The winners own different moments/i })
		).toBeInViewport();
		await page.getByRole('button', { name: /Go to chapter 5: Question/ }).click();
		await expect(
			page.getByRole('heading', { name: /What if one product connected/i })
		).toBeInViewport();
		await page.locator('#question').click({ position: { x: 16, y: 16 } });
		await page.keyboard.press('ArrowDown');
		await expect(
			page.getByRole('heading', { name: /Privy made that.*architecture possible/i })
		).toBeInViewport();
		await page.keyboard.press('End');
		await expect(
			page.getByRole('heading', { name: /Privy made the B2B.*product possible/i })
		).toBeInViewport();
		await page.keyboard.press('Home');
		await expect(
			page.getByRole('heading', { name: /Research found the workflow/i })
		).toBeInViewport();
		await page.keyboard.press('End');
		await page.getByRole('button', { name: /Restart story/ }).click();
		await expect(
			page.getByRole('heading', { name: /Research found the workflow/i })
		).toBeInViewport();
	});

	test('honors reduced motion and isolates presenter notes', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		await expect(page.locator('[data-slide="0"] .reveal').first()).toHaveCSS(
			'transition-duration',
			'0s'
		);
		const notes = page.locator('.presenter-notes');
		await expect(notes).toHaveAttribute('aria-hidden', 'true');
		await page.keyboard.press('n');
		await expect(notes).toHaveAttribute('aria-hidden', 'false');
	});

	for (const viewport of [
		{ width: 1920, height: 1080 },
		{ width: 1440, height: 900 },
		{ width: 1280, height: 720 }
	]) {
		test(`fits every chapter at ${viewport.width}x${viewport.height}`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await page.goto('/demo2');
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
			).toBe(false);
			const sections = page.locator('[data-slide]');
			for (let index = 0; index < 10; index += 1) {
				const box = await sections.nth(index).boundingBox();
				expect(box?.height).toBeGreaterThanOrEqual(viewport.height);
				expect(box?.width).toBeLessThanOrEqual(viewport.width);
			}
		});
	}
});
