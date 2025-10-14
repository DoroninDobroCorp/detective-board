import { test, expect } from '@playwright/test';

/**
 * Специфический тест для группы "Прочее" и задачи "сделать тревел ассистента"
 * Измеряет реальную производительность перетаскивания
 * 
 * ЗАПУСК: npm run test:prochee
 */

test.describe('Прочее - Тест перетаскивания', () => {
  test('Перетаскивание "сделать тревел ассистента" в группе Прочее', async ({ page }) => {
    console.log('🚀 Запуск теста...');
    
    // 1. Открываем приложение
    await page.goto('http://localhost:5173?diag=1&log=warn');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // даём время на загрузку данных из IndexedDB
    
    console.log('✅ Приложение загружено');

    // 2. Ищем группу "Прочее" на canvas
    // Конва рендерит в canvas, поэтому будем искать через координаты
    // Сначала получим все узлы из store
    const nodes = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      return useAppStore.getState().nodes;
    });

    console.log(`📊 Всего узлов в store: ${nodes.length}`);

    // Находим группу "Прочее"
    const procheeGroup = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const nodes = useAppStore.getState().nodes;
      return nodes.find((n: any) => 
        n.type === 'group' && 
        n.name && 
        n.name.toLowerCase().includes('прочее')
      );
    });

    if (!procheeGroup) {
      console.log('❌ Группа "Прочее" не найдена');
      console.log('Доступные группы:', await page.evaluate(async () => {
        const { useAppStore } = await import('../src/store');
        const nodes = useAppStore.getState().nodes;
        return nodes.filter((n: any) => n.type === 'group').map((n: any) => n.name);
      }));
      throw new Error('Группа "Прочее" не найдена в базе данных');
    }

    console.log(`✅ Найдена группа "Прочее": ${procheeGroup.name}`);
    console.log(`   Позиция: x=${procheeGroup.x}, y=${procheeGroup.y}`);

    // 3. Открываем группу "Прочее" (двойной клик)
    const viewport = await page.evaluate(() => {
      const { useAppStore } = (window as any).__vitePreload?.useAppStore || 
                               require('../src/store');
      return useAppStore?.getState().viewport || { x: 0, y: 0, scale: 1 };
    });

    // Вычисляем координаты на экране
    const groupScreenX = procheeGroup.x * viewport.scale + viewport.x + (procheeGroup.width / 2);
    const groupScreenY = procheeGroup.y * viewport.scale + viewport.y + (procheeGroup.height / 2);

    console.log(`🖱️  Кликаем на группу по координатам: x=${Math.round(groupScreenX)}, y=${Math.round(groupScreenY)}`);

    // Входим в группу программно (надежнее)
    await page.evaluate(async (groupId: string) => {
      const { useAppStore } = await import('../src/store');
      useAppStore.getState().enterGroup(groupId);
    }, procheeGroup.id);

    await page.waitForTimeout(500); // ждём анимации перехода

    console.log('✅ Вошли в группу "Прочее"');

    // 4. Ищем задачу "сделать тревел ассистента"
    const targetTask = await page.evaluate(async (parentId: string) => {
      const { useAppStore } = await import('../src/store');
      const nodes = useAppStore.getState().nodes;
      return nodes.find((n: any) => 
        n.type === 'task' && 
        n.parentId === parentId &&
        n.title && 
        n.title.toLowerCase().includes('тревел') &&
        n.title.toLowerCase().includes('ассистент')
      );
    }, procheeGroup.id);

    if (!targetTask) {
      console.log('❌ Задача "сделать тревел ассистента" не найдена');
      console.log('Доступные задачи в группе:', await page.evaluate(async (parentId: string) => {
        const { useAppStore } = await import('../src/store');
        const nodes = useAppStore.getState().nodes;
        return nodes
          .filter((n: any) => n.type === 'task' && n.parentId === parentId)
          .map((n: any) => n.title);
      }, procheeGroup.id));
      throw new Error('Задача не найдена');
    }

    console.log(`✅ Найдена задача: "${targetTask.title}"`);
    console.log(`   Позиция: x=${targetTask.x}, y=${targetTask.y}`);

    // 5. Вычисляем координаты задачи на экране (с учетом levelOrigin)
    const taskCoords = await page.evaluate(async (task: any, groupId: string) => {
      const { useAppStore } = await import('../src/store');
      const state = useAppStore.getState();
      const viewport = state.viewport;
      const nodes = state.nodes;
      
      // Вычисляем levelOrigin для текущей группы
      let levelOriginX = 0;
      let levelOriginY = 0;
      
      const group = nodes.find((n: any) => n.id === groupId);
      if (group) {
        levelOriginX = group.x;
        levelOriginY = group.y;
        
        // Добавляем координаты родительских групп
        let parentId = group.parentId;
        let hops = 0;
        while (parentId && hops < 10) {
          const parent = nodes.find((n: any) => n.id === parentId);
          if (!parent) break;
          levelOriginX += parent.x;
          levelOriginY += parent.y;
          parentId = parent.parentId;
          hops++;
        }
      }
      
      // Координаты задачи на экране
      const screenX = (levelOriginX + task.x) * viewport.scale + viewport.x;
      const screenY = (levelOriginY + task.y) * viewport.scale + viewport.y;
      
      return {
        screenX: screenX + (task.width / 2),
        screenY: screenY + (task.height / 2),
        width: task.width,
        height: task.height,
      };
    }, targetTask, procheeGroup.id);

    console.log(`📍 Координаты задачи на экране: x=${Math.round(taskCoords.screenX)}, y=${Math.round(taskCoords.screenY)}`);

    // 6. Настраиваем мониторинг производительности
    await page.evaluate(() => {
      (window as any).__perfMetrics = {
        fps: [],
        frameTimestamps: [],
        dragStartTime: 0,
        frameCount: 0,
      };
      
      let lastFrameTime = performance.now();
      
      const measureFrame = () => {
        const now = performance.now();
        const delta = now - lastFrameTime;
        
        if ((window as any).__perfMetrics.dragStartTime > 0) {
          const fps = 1000 / delta;
          (window as any).__perfMetrics.fps.push(fps);
          (window as any).__perfMetrics.frameTimestamps.push(now);
          (window as any).__perfMetrics.frameCount++;
        }
        
        lastFrameTime = now;
        requestAnimationFrame(measureFrame);
      };
      
      measureFrame();
    });

    console.log('📊 Мониторинг FPS запущен');

    // 7. ПЕРЕТАСКИВАНИЕ!
    console.log('🖱️  Начинаем перетаскивание...');
    
    // Наводим курсор на задачу
    await page.mouse.move(taskCoords.screenX, taskCoords.screenY);
    await page.waitForTimeout(100);

    // Начинаем мониторинг
    await page.evaluate(() => {
      (window as any).__perfMetrics.dragStartTime = performance.now();
    });

    // Нажимаем кнопку мыши
    await page.mouse.down();
    await page.waitForTimeout(50);

    console.log('🎯 Перетаскиваем задачу по траектории...');

    // Плавное перетаскивание по траектории (эмуляция реального пользователя)
    const steps = 30;
    const deltaX = 200; // 200 пикселей вправо
    const deltaY = 150; // 150 пикселей вниз
    
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Easing для плавности (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const newX = taskCoords.screenX + deltaX * eased;
      const newY = taskCoords.screenY + deltaY * eased;
      
      await page.mouse.move(newX, newY);
      await page.waitForTimeout(16); // ~60 FPS
    }

    // Отпускаем кнопку мыши
    await page.mouse.up();
    await page.waitForTimeout(100);

    console.log('✅ Перетаскивание завершено');

    // 8. Собираем и анализируем метрики
    const metrics = await page.evaluate(() => {
      const m = (window as any).__perfMetrics;
      
      if (m.fps.length === 0) {
        return {
          avgFPS: 0,
          minFPS: 0,
          maxFPS: 0,
          frameCount: 0,
          totalDuration: 0,
          droppedFrames: 0,
        };
      }
      
      const avgFPS = m.fps.reduce((a: number, b: number) => a + b, 0) / m.fps.length;
      const minFPS = Math.min(...m.fps);
      const maxFPS = Math.max(...m.fps);
      const totalDuration = m.frameTimestamps[m.frameTimestamps.length - 1] - m.frameTimestamps[0];
      
      // Считаем дропнутые кадры (< 30 FPS = проблема)
      const droppedFrames = m.fps.filter((fps: number) => fps < 30).length;
      
      return {
        avgFPS: Math.round(avgFPS * 10) / 10,
        minFPS: Math.round(minFPS * 10) / 10,
        maxFPS: Math.round(maxFPS * 10) / 10,
        frameCount: m.frameCount,
        totalDuration: Math.round(totalDuration),
        droppedFrames,
      };
    });

    // 9. Выводим красивый отчет
    console.log('\n' + '='.repeat(60));
    console.log('📊 РЕЗУЛЬТАТЫ ТЕСТА ПРОИЗВОДИТЕЛЬНОСТИ');
    console.log('='.repeat(60));
    console.log(`Задача: "${targetTask.title}"`);
    console.log(`Группа: "${procheeGroup.name}"`);
    console.log('─'.repeat(60));
    console.log(`🎯 Средний FPS:      ${metrics.avgFPS} ${metrics.avgFPS >= 55 ? '✅' : metrics.avgFPS >= 45 ? '⚠️' : '❌'}`);
    console.log(`📉 Минимальный FPS:  ${metrics.minFPS} ${metrics.minFPS >= 45 ? '✅' : metrics.minFPS >= 30 ? '⚠️' : '❌'}`);
    console.log(`📈 Максимальный FPS: ${metrics.maxFPS}`);
    console.log(`🎬 Всего кадров:     ${metrics.frameCount}`);
    console.log(`⏱️  Длительность:     ${metrics.totalDuration}ms`);
    console.log(`❌ Дропнутых кадров: ${metrics.droppedFrames} ${metrics.droppedFrames === 0 ? '✅' : '⚠️'}`);
    console.log('─'.repeat(60));
    
    // Оценка плавности
    let verdict = '';
    let emoji = '';
    
    if (metrics.avgFPS >= 55 && metrics.minFPS >= 45 && metrics.droppedFrames === 0) {
      verdict = 'ИДЕАЛЬНО! Плавность как масло 🧈';
      emoji = '🎉';
    } else if (metrics.avgFPS >= 45 && metrics.minFPS >= 30) {
      verdict = 'Хорошо, но есть микролаги ⚠️';
      emoji = '👍';
    } else if (metrics.avgFPS >= 30) {
      verdict = 'Заметные лаги, нужна оптимизация 🔧';
      emoji = '😐';
    } else {
      verdict = 'КРИТИЧЕСКИЕ ЛАГИ! Требуется серьёзная оптимизация 🚨';
      emoji = '🐌';
    }
    
    console.log(`${emoji} ${verdict}`);
    console.log('='.repeat(60) + '\n');

    // 10. Проверки для CI
    expect(metrics.avgFPS, 'Средний FPS должен быть >= 45').toBeGreaterThanOrEqual(45);
    expect(metrics.minFPS, 'Минимальный FPS должен быть >= 30').toBeGreaterThanOrEqual(30);
    expect(metrics.droppedFrames, 'Не должно быть критических провалов').toBeLessThan(5);

    console.log('✅ Все проверки пройдены!');
  });
});
