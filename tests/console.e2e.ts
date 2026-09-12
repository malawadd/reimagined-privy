import { expect, test } from '@playwright/test';

test('mock operator can sign in and inspect control surfaces', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Send secure code' }).click();
	await page.getByRole('button', { name: 'Enter workspace' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await expect(page.getByRole('heading', { name: 'Good morning, Avery' })).toBeVisible();
	await page.getByRole('link', { name: 'Payments' }).click();
	await expect(page.getByText('Automatic execution')).toBeVisible();
	await page.getByLabel('Amount').fill('4800');
	await expect(page.getByRole('heading', { name: 'Quorum approval' })).toBeVisible();
	await page.getByRole('link', { name: 'Policies' }).click();
	await expect(page.getByText('Generated Privy JSON')).toBeVisible();
	await page.getByRole('link', { name: 'Audit log' }).click();
	await expect(page.getByText('payment.intent_created')).toBeVisible();
});
