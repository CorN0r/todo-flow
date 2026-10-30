import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { useMyDayPlanStore } from '../../stores/myDayPlanStore';
import { todayISO } from '../../lib/date';
import { buildTask } from '../test-utils';

const TODAY = todayISO();

function setupAi(options: { defaultModel?: boolean } = {}) {
  const { repositories, state } = createMemoryRepositories({
    tasks: [
      buildTask({ id: 't1', title: '候选一', tag_ids: ['tagA'] }),
      buildTask({ id: 't2', title: '候选二', my_day_date: TODAY, tag_ids: ['tagA'] }),
    ],
  });
  if (options.defaultModel !== false) state.aiDefaultModel = 'model-1';
  setRepositoriesForTesting(repositories);
  return { repositories, state };
}

describe('myDayPlanStore 会话生命周期', () => {
  beforeEach(() => {
    resetRepositories();
    useMyDayPlanStore.setState({ sessions: {} });
    vi.restoreAllMocks();
  });

  it('prepare:记录候选与范围基准,清空旧草稿', async () => {
    const { repositories } = setupAi();
    const spy = vi.spyOn(repositories.ai, 'prepareMyDayContext');

    await useMyDayPlanStore.getState().prepare(TODAY, { tagIds: ['tagA'] });

    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.status).toBe('ready');
    expect(session?.preview?.candidates.length).toBe(2);
    expect(session?.preparedTagIds).toEqual(['tagA']);
    expect(session?.drafts).toHaveLength(0);
    expect(spy).toHaveBeenCalledWith({ tagIds: ['tagA'], manualTaskIds: [], subtaskPicks: [] });
  });

  it('prepare:失败进入 error,不产生候选', async () => {
    const { repositories } = setupAi();
    vi.spyOn(repositories.ai, 'prepareMyDayContext').mockRejectedValueOnce({
      code: 'validation',
      message: '手动补入的任务不在当前范围',
    });

    await useMyDayPlanStore.getState().prepare(TODAY, {});
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.status).toBe('error');
    expect(session?.error).toContain('不在当前范围');
  });

  it('generate:完成后草稿默认全选,必做项带标记;失败保留旧草稿', async () => {
    const { repositories } = setupAi();
    await useMyDayPlanStore.getState().prepare(TODAY, {});
    const store = useMyDayPlanStore.getState();
    store.toggleMandatory(TODAY, 't1');

    await useMyDayPlanStore.getState().generate(TODAY);
    let session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.status).toBe('done');
    expect(session?.drafts).toHaveLength(2);
    expect(session?.drafts.every((d) => d.selected)).toBe(true);
    expect(session?.drafts.find((d) => d.root_task_id === 't1')?.was_mandatory).toBe(true);
    expect(session?.drafts.find((d) => d.root_task_id === 't2')?.already_in_my_day).toBe(true);

    // 重新生成失败:保留旧草稿与错误文案
    vi.spyOn(repositories.ai, 'generateMyDayPlan').mockRejectedValueOnce({
      code: 'timeout',
      message: 'upstream 504',
    });
    await useMyDayPlanStore.getState().generate(TODAY);
    session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.status).toBe('error');
    expect(session?.error).toBe('模型服务响应超时,请稍后重试');
    expect(session?.drafts).toHaveLength(2);
  });

  it('generate:会话无候选上下文时报错,不发请求', async () => {
    const { repositories } = setupAi();
    const spy = vi.spyOn(repositories.ai, 'generateMyDayPlan');
    // prepare 失败留下无 contextId 的会话,再触发生成
    vi.spyOn(repositories.ai, 'prepareMyDayContext').mockRejectedValueOnce({
      code: 'internal',
      message: '数据库错误',
    });
    await useMyDayPlanStore.getState().prepare(TODAY, {});
    await useMyDayPlanStore.getState().generate(TODAY);
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.status).toBe('error');
    expect(session?.error).toBe('请先准备候选');
    expect(spy).not.toHaveBeenCalled();
  });

  it('必做与排除互斥;换一件解除必做并重新生成', async () => {
    const { repositories } = setupAi();
    await useMyDayPlanStore.getState().prepare(TODAY, {});
    const store = useMyDayPlanStore.getState();
    store.toggleMandatory(TODAY, 't1');
    store.toggleExcluded(TODAY, 't1');
    // 设排除会解除必做
    expect(useMyDayPlanStore.getState().sessions[TODAY]?.mandatory).not.toContain('t1');
    expect(useMyDayPlanStore.getState().sessions[TODAY]?.excluded).toContain('t1');

    // 反向:设必做会解除排除
    store.toggleMandatory(TODAY, 't1');
    expect(useMyDayPlanStore.getState().sessions[TODAY]?.excluded).not.toContain('t1');

    const spy = vi.spyOn(repositories.ai, 'generateMyDayPlan');
    await useMyDayPlanStore.getState().generate(TODAY);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ mandatoryTaskIds: ['t1'] }));

    // 换一件 index 0(t1):排除并解除必做后自动重新生成
    await useMyDayPlanStore.getState().swapOut(TODAY, 0);
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.excluded).toContain('t1');
    expect(session?.mandatory).not.toContain('t1');
    expect(session?.status).toBe('done');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ excludedTaskIds: ['t1'] }));
  });

  it('草稿编辑/勾选/换序直接反映到会话', async () => {
    setupAi();
    await useMyDayPlanStore.getState().prepare(TODAY, {});
    await useMyDayPlanStore.getState().generate(TODAY);
    const store = useMyDayPlanStore.getState();

    store.editDraft(TODAY, 0, { next_step: '新的第一步' });
    store.toggleDraftSelected(TODAY, 1);
    store.moveDraft(TODAY, 0, 1);

    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.drafts.find((d) => d.next_step === '新的第一步')).toBeTruthy();
    expect(session?.drafts.filter((d) => !d.selected)).toHaveLength(1);
    // 换序后 t2 在前
    expect(session?.drafts[0].root_task_id).toBe('t2');
  });

  it('手动补入进入候选最前,撤销后移出,范围变化时重置', async () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      buildTask({ id: `bulk-${i}`, title: `任务 ${i + 1}` }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: many });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    await useMyDayPlanStore.getState().prepare(TODAY, {});
    let session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.preview?.candidates).toHaveLength(20);
    expect(session?.preview?.omitted_candidates).toHaveLength(2);

    // 补入被遗漏的任务:重新准备后进入候选最前;总量仍为 20,未带入的是另外两项
    await useMyDayPlanStore.getState().addManualTask(TODAY, 'bulk-21');
    session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.manualTaskIds).toEqual(['bulk-21']);
    expect(session?.preview?.candidates).toHaveLength(20);
    expect(session?.preview?.candidates[0].task_id).toBe('bulk-21');
    expect(session?.preview?.omitted_candidates.map((o) => o.task_id).sort()).toEqual(['bulk-19', 'bulk-20']);

    // 撤销补入
    await useMyDayPlanStore.getState().removeManualTask(TODAY, 'bulk-21');
    session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.manualTaskIds).toEqual([]);
    expect(session?.preview?.candidates[0].task_id).toBe('bulk-0');

    // 范围变化(换标签)重置手动补入与子任务选择
    await useMyDayPlanStore.getState().addManualTask(TODAY, 'bulk-21');
    await useMyDayPlanStore.getState().prepare(TODAY, { tagIds: ['nonexistent'] });
    session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.manualTaskIds).toEqual([]);
    expect(session?.preview?.candidates).toHaveLength(0);
  });

  it('子任务替换:默认前 5,换入遗漏项时移出末位,移出后可再纳入', async () => {
    const root = buildTask({ id: 'r1', title: '根任务' });
    const children = Array.from({ length: 7 }, (_, i) =>
      buildTask({ id: `s${i}`, title: `步骤 ${i}`, parent_task_id: 'r1' }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: [root, ...children] });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    await useMyDayPlanStore.getState().prepare(TODAY, {});
    let session = useMyDayPlanStore.getState().sessions[TODAY];
    const cand = session?.preview?.candidates[0];
    expect(cand?.subtasks.map((s) => s.subtask_id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(cand?.omitted_subtask_details.map((s) => s.subtask_id)).toEqual(['s5', 's6']);

    // 换入 s5:已满 5 项,末位 s4 让位
    await useMyDayPlanStore.getState().toggleSubtaskPick(TODAY, 'r1', 's5');
    session = useMyDayPlanStore.getState().sessions[TODAY];
    let after = session?.preview?.candidates[0];
    expect(after?.subtasks.map((s) => s.subtask_id)).toEqual(['s0', 's1', 's2', 's3', 's5']);
    expect(after?.omitted_subtask_details.map((s) => s.subtask_id)).toEqual(['s4', 's6']);

    // 移出已纳入的 s0
    await useMyDayPlanStore.getState().toggleSubtaskPick(TODAY, 'r1', 's0');
    session = useMyDayPlanStore.getState().sessions[TODAY];
    after = session?.preview?.candidates[0];
    expect(after?.subtasks.map((s) => s.subtask_id)).toEqual(['s1', 's2', 's3', 's5']);
    expect(after?.omitted_subtask_details.map((s) => s.subtask_id)).toEqual(['s0', 's4', 's6']);
  });

  it('clear:清空当日会话,跨日会话互不影响', async () => {
    setupAi();
    await useMyDayPlanStore.getState().prepare(TODAY, {});
    await useMyDayPlanStore.getState().prepare('2020-01-01', {});

    useMyDayPlanStore.getState().clear(TODAY);
    expect(useMyDayPlanStore.getState().sessions[TODAY]).toBeUndefined();
    expect(useMyDayPlanStore.getState().sessions['2020-01-01']).toBeDefined();
  });
});
