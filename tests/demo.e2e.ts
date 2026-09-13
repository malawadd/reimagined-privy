import { expect, test } from '@playwright/test';

test.describe('Ratib presentation deck', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto('/demo');
		await page.waitForFunction(() => document.documentElement.classList.contains('demo-mode'));
	});

	test('presents the research-backed narrative and authority boundary', async ({ page }) => {
		await expect(page).toHaveTitle(/Ratib.*Three-minute product story/i);
		await expect(
			page.getByRole('heading', { name: /Digital assets moved.*Finance operations didn’t/i })
		).toBeVisible();
		await expect(page.getByText('27').first()).toBeAttached();
		await expect(page.getByText('products mapped')).toBeAttached();
		await expect(page.getByText('20').first()).toBeAttached();
		await expect(page.getByText('platforms compared')).toBeAttached();
		await expect(page.getByText('41').first()).toBeAttached();
		await expect(page.getByText('evidence records')).toBeAttached();
		await expect(
			page.getByText('Privy gave Ratib an authority layer', { exact: false })
		).toBeAttached();
		await expect(page.getByText('Ratib roles never grant signing authority.')).toBeAttached();
		await expect(page.getByText('Base Sepolia', { exact: true }).first()).toBeAttached();
		await expect(page.getByRole('link', { name: /Enter Ratib/ })).toHaveAttribute('href', '/login');
		await expect(page.locator('[data-slide]')).toHaveCount(9);
	});

	test('supports presenter keyboard navigation, notes, and restart', async ({ page }) => {
		const problem = page.getByRole('heading', {
			name: /One transaction.*Three disconnected systems/i
		});
		await page.keyboard.press('ArrowDown');
		await expect(problem).toBeInViewport();
		await expect(page.getByText('02 / 09')).toBeVisible();

		await page.keyboard.press('n');
		await expect(page.getByRole('complementary', { name: 'Presenter notes' })).toHaveClass(/open/);
		await expect(page.getByText('00:15–00:35').last()).toBeVisible();
		await page.keyboard.press('n');
		await expect(page.locator('.presenter-notes')).not.toHaveClass(/open/);

		await page.keyboard.press('End');
		await expect(
			page.getByRole('heading', { name: /Ratib turns wallet authority/i })
		).toBeInViewport();
		await page.getByRole('button', { name: /Restart story/ }).click();
		await expect(
			page.getByRole('heading', { name: /Digital assets moved.*Finance operations didn’t/i })
		).toBeInViewport();
	});

	test('honors reduced-motion preferences', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		await expect(page.locator('[data-slide="0"] .reveal').first()).toHaveCSS(
			'transition-duration',
			'0s'
		);
		await expect(page.locator('.gap-orbit').first()).toHaveCSS('animation-name', 'none');
	});

	for (const viewport of [
		{ width: 1920, height: 1080 },
		{ width: 1440, height: 900 },
		{ width: 1280, height: 720 }
	]) {
		test(`fits every chapter at ${viewport.width}x${viewport.height}`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await page.goto('/demo');
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth
			);
			expect(overflow).toBe(false);

			const sections = page.locator('[data-slide]');
			for (let index = 0; index < 9; index += 1) {
				const box = await sections.nth(index).boundingBox();
				expect(box?.height).toBeGreaterThanOrEqual(viewport.height);
				expect(box?.width).toBeLessThanOrEqual(viewport.width);
			}
		});
	}
});
