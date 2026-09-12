import { expect, test } from '@playwright/test';

test('landing page presents the real product scope', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/Ratib/);
	await expect(page.getByRole('heading', { name: 'Ratib', exact: true })).toBeVisible();
	await expect(page.getByText('Ratib coordinates. Privy authorizes.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Enter Ratib' })).toHaveAttribute('href', '/login');
});

test('landing page remains usable at a mobile viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Ratib', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /Open workspace/ })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth
	);
	expect(overflow).toBe(false);
});

test('login exposes only configured Privy authentication methods', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await expect(page.getByLabel('Work email')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
	await expect(page.getByText(/OTP 123456/i)).toHaveCount(0);
});
