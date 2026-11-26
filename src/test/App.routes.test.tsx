import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { MainRoutes } from '../App';
import { renderWithProviders } from './test-utils';
import { useUIStore } from '../stores/uiStore';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string) {
  return renderWithProviders(
    <>
      <MainRoutes />
      <LocationProbe />
    </>,
    { initialEntries: [path] },
  );
}

describe('MainRoutes', () => {
  beforeEach(() => {
    useUIStore.setState({ taskViewMode: 'list', taskStatusFilter: 'all', selectedTaskId: null, showQuickAdd: false });
  });

  it('根地址显示我的一天', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: '我的一天' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/myday');
  });

  it('旧看板地址落到全部任务并启用看板视图', async () => {
    renderAt('/kanban');

    expect(await screen.findByRole('heading', { name: '全部任务' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/date/all');
    expect(useUIStore.getState().taskViewMode).toBe('kanban');
  });

  it('旧四象限地址落到全部任务并启用四象限视图', async () => {
    renderAt('/matrix');

    expect(await screen.findByRole('heading', { name: '全部任务' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/date/all');
    expect(useUIStore.getState().taskViewMode).toBe('matrix');
  });
});
