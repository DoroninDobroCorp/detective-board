import { test, expect } from '@playwright/test';

/**
 * ПРОСТОЙ тест производительности перетаскивания
 * С таймаутами и без сложной логики
 */

test.setTimeout(30000); // 30 секунд максимум

test('Простой тест перетаскивания с FPS', async ({ page }) => {
  console.log('🚀 Запуск теста...');
  
  // 1. Открываем приложение с таймаутом
  const startTime = Date.now();
  await Promise.race([
    page.goto('http://localhost:5173'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading page')), 10000))
  ]);
  
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
    console.log('⚠️ networkidle timeout, продолжаем...');
  });
  
  await page.waitForTimeout(2000);
  console.log(`✅ Приложение загружено за ${Date.now() - startTime}ms`);

  // 2. Создаем тестовую задачу программно (быстро и надежно)
  console.log('📝 Создаем тестовую задачу...');
  
  const taskId = await page.evaluate(async () => {
    const { useAppStore } = await import('../src/store');
    const addTask = useAppStore.getState().addTask;
    
    // Создаем задачу в центре экрана
    const id = await addTask({ x: 400, y: 300 });
    
    // Обновляем заголовок
    await useAppStore.getState().updateNode(id, { 
      title: 'Тестовая задача для перетаскивания' 
    });
    
    return id;
  });
  
  console.log(`✅ Создана задача: ${taskId}`);

  // 3. Настраиваем FPS мониторинг (простой)
  await page.evaluate(() => {
    (window as any).__fps = [];
    (window as any).__dragStart = 0;
    
    let lastTime = performance.now();
    
    const measure = () => {
      const now = performance.now();
      if ((window as any).__dragStart > 0) {
        const fps = 1000 / (now - lastTime);
        (window as any).__fps.push(fps);
      }
      lastTime = now;
      requestAnimationFrame(measure);
    };
    
    measure();
  });

  console.log('📊 FPS мониторинг запущен');

  // 4. Находим координаты задачи на canvas
  const taskInfo = await page.evaluate((id: string) => {
    const { useAppStore } = (window as any).__vitePreload?.useAppStore || 
                             require('../src/store');
    const state = useAppStore.getState();
    const task = state.nodes.find((n: any) => n.id === id);
    const viewport = state.viewport;
    
    if (!task) return null;
    
    const screenX = task.x * viewport.scale + viewport.x + task.width / 2;
    const screenY = task.y * viewport.scale + viewport.y + task.height / 2;
    
    return { screenX, screenY, width: task.width, height: task.height };
  }, taskId);

  if (!taskInfo) {
    throw new Error('Не удалось найти координаты задачи');
  }

  console.log(`📍 Координаты задачи: x=${Math.round(taskInfo.screenX)}, y=${Math.round(taskInfo.screenY)}`);

  // 5. ПЕРЕТАСКИВАНИЕ!
  console.log('🖱️  Начинаем перетаскивание...');
  
  await page.mouse.move(taskInfo.screenX, taskInfo.screenY);
  await page.waitForTimeout(100);
  
  // Старт мониторинга
  await page.evaluate(() => {
    (window as any).__dragStart = performance.now();
  });
  
  await page.mouse.down();
  await page.waitForTimeout(50);
  
  // Перетаскиваем плавно (20 шагов по 16ms)
  const steps = 20;
  const deltaX = 200;
  const deltaY = 150;
  
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const newX = taskInfo.screenX + deltaX * progress;
    const newY = taskInfo.screenY + deltaY * progress;
    
    await page.mouse.move(newX, newY);
    await page.waitForTimeout(16);
  }
  
  await page.mouse.up();
  await page.waitForTimeout(100);
  
  console.log('✅ Перетаскивание завершено');

  // 6. Собираем метрики
  const metrics = await page.evaluate(() => {
    const fps = (window as any).__fps || [];
    
    if (fps.length === 0) {
      return { avgFPS: 0, minFPS: 0, maxFPS: 0, count: 0 };
    }
    
    const avg = fps.reduce((a: number, b: number) => a + b, 0) / fps.length;
    const min = Math.min(...fps);
    const max = Math.max(...fps);
    
    return {
      avgFPS: Math.round(avg * 10) / 10,
      minFPS: Math.round(min * 10) / 10,
      maxFPS: Math.round(max * 10) / 10,
      count: fps.length,
    };
  });

  // 7. Красивый отчет
  console.log('\n' + '='.repeat(60));
  console.log('📊 РЕЗУЛЬТАТЫ ТЕСТА');
  console.log('='.repeat(60));
  console.log(`🎯 Средний FPS:      ${metrics.avgFPS} ${metrics.avgFPS >= 55 ? '✅' : metrics.avgFPS >= 45 ? '⚠️' : '❌'}`);
  console.log(`📉 Минимальный FPS:  ${metrics.minFPS} ${metrics.minFPS >= 45 ? '✅' : metrics.minFPS >= 30 ? '⚠️' : '❌'}`);
  console.log(`📈 Максимальный FPS: ${metrics.maxFPS}`);
  console.log(`🎬 Измерено кадров:  ${metrics.count}`);
  console.log('─'.repeat(60));
  
  let verdict = '';
  if (metrics.avgFPS >= 55 && metrics.minFPS >= 45) {
    verdict = '🎉 ИДЕАЛЬНО! Плавность как масло';
  } else if (metrics.avgFPS >= 45 && metrics.minFPS >= 30) {
    verdict = '👍 Хорошо, но есть микролаги';
  } else if (metrics.avgFPS >= 30) {
    verdict = '😐 Заметные лаги, нужна оптимизация';
  } else {
    verdict = '🐌 КРИТИЧЕСКИЕ ЛАГИ!';
  }
  
  console.log(verdict);
  console.log('='.repeat(60) + '\n');

  // 8. Проверки
  expect(metrics.avgFPS, 'Средний FPS должен быть >= 40').toBeGreaterThanOrEqual(40);
  expect(metrics.minFPS, 'Минимальный FPS должен быть >= 25').toBeGreaterThanOrEqual(25);
  
  console.log('✅ Тест завершён успешно!');
});
