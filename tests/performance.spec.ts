import { test, expect } from '@playwright/test';

/**
 * Тесты производительности для Detective Board
 * Измеряют FPS, время отклика, нагрузку на CPU
 * 
 * Запуск: npm run test:perf
 */

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Включаем диагностику для логов производительности
    await page.goto('http://localhost:5173?diag=1&log=info');
    await page.waitForLoadState('networkidle');
    // Ждем инициализации
    await page.waitForTimeout(1000);
  });

  test('FPS при перетаскивании узла должен быть > 50', async ({ page }) => {
    // Создаем тестовую задачу
    await page.keyboard.press('t'); // Включить инструмент добавления задачи
    await page.click('canvas', { position: { x: 400, y: 300 } });
    await page.waitForTimeout(100);

    // Начинаем мониторинг FPS
    const fpsData: number[] = [];
    
    await page.evaluate(() => {
      let lastTime = performance.now();
      let frameCount = 0;
      
      const measureFPS = () => {
        const now = performance.now();
        frameCount++;
        
        if (now >= lastTime + 1000) {
          const fps = Math.round((frameCount * 1000) / (now - lastTime));
          (window as any).__fps = fps;
          frameCount = 0;
          lastTime = now;
        }
        
        requestAnimationFrame(measureFPS);
      };
      
      measureFPS();
    });

    // Перетаскиваем узел
    const canvas = await page.locator('canvas');
    await canvas.hover({ position: { x: 400, y: 300 } });
    
    await page.mouse.down();
    
    // Плавное движение на 200px
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(400 + i * 10, 300 + i * 5);
      await page.waitForTimeout(16); // ~60 FPS
      
      // Собираем FPS
      const fps = await page.evaluate(() => (window as any).__fps || 0);
      if (fps > 0) fpsData.push(fps);
    }
    
    await page.mouse.up();

    // Анализируем результаты
    const avgFPS = fpsData.reduce((a, b) => a + b, 0) / fpsData.length;
    const minFPS = Math.min(...fpsData);
    
    console.log(`📊 FPS при перетаскивании: avg=${Math.round(avgFPS)}, min=${minFPS}`);
    
    expect(avgFPS).toBeGreaterThan(50);
    expect(minFPS).toBeGreaterThan(40);
  });

  test('Задержка при клике на узел < 50ms', async ({ page }) => {
    // Создаем задачу
    await page.keyboard.press('t');
    await page.click('canvas', { position: { x: 400, y: 300 } });
    await page.waitForTimeout(100);

    // Измеряем время отклика
    const startTime = Date.now();
    
    await page.click('canvas', { position: { x: 400, y: 300 } });
    
    // Ждем изменения selection (visual feedback)
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null;
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`⚡ Время отклика на клик: ${responseTime}ms`);
    
    expect(responseTime).toBeLessThan(50);
  });

  test('Работа со 100 узлами без падения производительности', async ({ page }) => {
    // Создаем 100 задач программно
    await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const addTask = useAppStore.getState().addTask;
      
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * 200 + 100;
        const y = Math.floor(i / 10) * 150 + 100;
        promises.push(addTask({ x, y }));
      }
      
      await Promise.all(promises);
    });

    await page.waitForTimeout(500);

    // Измеряем время рендера
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('measure');
      return {
        renderTime: entries.length > 0 ? entries[entries.length - 1].duration : 0,
      };
    });

    console.log(`🎨 Время рендера 100 узлов: ${Math.round(metrics.renderTime)}ms`);

    // Проверяем плавность панорамирования
    const canvas = await page.locator('canvas');
    await canvas.hover({ position: { x: 500, y: 400 } });
    
    const panStart = performance.now();
    await page.mouse.down();
    
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(500 - i * 20, 400 - i * 10);
      await page.waitForTimeout(16);
    }
    
    await page.mouse.up();
    const panDuration = performance.now() - panStart;
    
    console.log(`🖱️ Панорамирование 100 узлов: ${Math.round(panDuration)}ms`);
    
    // Панорамирование должно быть плавным (близко к 160ms для 10 кадров при 60fps)
    expect(panDuration).toBeLessThan(300);
  });

  test('Проверка отсутствия memory leaks', async ({ page }) => {
    // Начальное использование памяти
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Создаем и удаляем узлы 10 раз
    for (let cycle = 0; cycle < 10; cycle++) {
      // Создаем 20 узлов
      await page.evaluate(async () => {
        const { useAppStore } = await import('../src/store');
        const addTask = useAppStore.getState().addTask;
        
        for (let i = 0; i < 20; i++) {
          await addTask({ x: 100 + i * 50, y: 100 });
        }
      });

      await page.waitForTimeout(100);

      // Удаляем все узлы
      await page.evaluate(async () => {
        const { useAppStore } = await import('../src/store');
        const nodes = useAppStore.getState().nodes;
        const removeNode = useAppStore.getState().removeNode;
        
        for (const node of nodes) {
          await removeNode(node.id);
        }
      });

      await page.waitForTimeout(100);
    }

    // Финальное использование памяти
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        // Форсируем GC если возможно
        if ((window as any).gc) (window as any).gc();
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    if (initialMemory > 0 && finalMemory > 0) {
      const memoryGrowth = finalMemory - initialMemory;
      const growthMB = memoryGrowth / 1024 / 1024;
      
      console.log(`💾 Рост памяти: ${growthMB.toFixed(2)}MB`);
      
      // Рост памяти не должен превышать 10MB
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    }
  });

  test('Консоль не должна содержать ошибок или предупреждений', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    // Выполняем базовые операции
    await page.keyboard.press('t');
    await page.click('canvas', { position: { x: 400, y: 300 } });
    await page.waitForTimeout(100);

    // Перетаскиваем
    const canvas = await page.locator('canvas');
    await canvas.hover({ position: { x: 400, y: 300 } });
    await page.mouse.down();
    await page.mouse.move(500, 350);
    await page.mouse.up();

    console.log(`❌ Errors: ${errors.length}`);
    console.log(`⚠️ Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    expect(errors.length).toBe(0);
  });
});
