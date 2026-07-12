import { describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../../domain/adapters/memory';

describe('createMemoryRepositories', () => {
  it('supports local task creation, update, and listing', async () => {
    const { repositories } = createMemoryRepositories();

    const created = await repositories.tasks.create({ title: 'Capture Android idea', priority: 2 });
    const updated = await repositories.tasks.update({ id: created.id, is_completed: true });
    const tasks = await repositories.tasks.list({ is_completed: true });

    expect(updated.is_completed).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Capture Android idea');
  });

  it('stores settings without a Tauri runtime', async () => {
    const { repositories } = createMemoryRepositories();

    await repositories.settings.set('theme', 'lumina');

    await expect(repositories.settings.get('theme')).resolves.toBe('lumina');
    await expect(repositories.settings.getAll()).resolves.toEqual({ theme: 'lumina' });
  });

  it('derives sync status from queued operations and conflicts', async () => {
    const { repositories } = createMemoryRepositories();
    const operation = await repositories.sync.recordOperation({
      entity_type: 'task',
      entity_id: 'task-1',
      operation: 'update',
      payload: { title: 'New title' },
      device_id: 'device-1',
    });

    await expect(repositories.sync.deriveEntityStatus('task', 'task-1')).resolves.toBe('pending');

    await repositories.sync.incrementRetry(operation.op_id, 'network failed');
    await expect(repositories.sync.deriveEntityStatus('task', 'task-1')).resolves.toBe('failed');

    await repositories.sync.saveConflict({
      entity_type: 'task',
      entity_id: 'task-1',
      local_payload: { title: 'Local' },
      remote_payload: { title: 'Remote' },
    });
    await expect(repositories.sync.deriveEntityStatus('task', 'task-1')).resolves.toBe('conflicted');
  });
});
