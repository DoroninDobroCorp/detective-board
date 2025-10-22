import { test, expect } from '@playwright/test';

test('should load app at /detective-board/', async ({ page }) => {
  console.log('Loading app...');
  await page.goto('http://localhost:5173/detective-board/');
  
  // Wait for app to load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check for React Router error
  const routerError = await page.locator('text=/No routes matched/').count();
  console.log('Router error count:', routerError);

  // Take screenshot
  await page.screenshot({ path: 'test-results/basic-load.png', fullPage: true });

  // Check if toolbar is visible
  const toolbar = await page.locator('.toolbar, [class*="tool"]').first().isVisible().catch(() => false);
  console.log('Toolbar visible:', toolbar);

  // Log console errors
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`Browser ${msg.type()}: ${msg.text()}`);
    }
  });

  // Get page content
  const content = await page.content();
  console.log('Page title:', await page.title());
  console.log('Has root div:', content.includes('id="root"'));
  
  // Check current URL
  const url = page.url();
  console.log('Current URL:', url);

  // Should not have router error
  expect(routerError).toBe(0);
});
