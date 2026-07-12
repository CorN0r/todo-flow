import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileApp } from '../../mobile/MobileApp';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { resetRepositories, setRepositoriesForTesting } from '../../domain/repositories/current';
import { renderWithProviders } from '../test-utils';

function renderMobileApp(initialEntry = '/mobile/today') {
  return renderWithProviders(
    <Routes>
      <Route path="/mobile/*" element={<MobileApp />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

describe('MobileApp', () => {
  beforeEach(() => {
    setRepositoriesForTesting(createMemoryRepositories().repositories);
  });

  afterEach(() => {
    resetRepositories();
  });

  it('renders the Android mobile shell with primary bottom navigation', () => {
    renderMobileApp();

    expect(document.querySelector('[data-app-surface="mobile"]')).toBeInTheDocument();
    expect(screen.getByText('TodoFlow')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: '\u4e3b\u5bfc\u822a' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(5);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/mobile/today',
      '/mobile/tasks',
      '/mobile/calendar',
      '/mobile/habits',
      '/mobile/settings',
    ]);

    for (const label of ['\u4eca\u5929', '\u4efb\u52a1', '\u65e5\u5386', '\u4e60\u60ef', '\u8bbe\u7f6e']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('does not mount desktop shell elements inside the mobile route', () => {
    renderMobileApp();

    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('header[data-tauri-drag-region]')).not.toBeInTheDocument();
  });

  it('navigates between primary mobile tabs', async () => {
    const user = userEvent.setup();
    renderMobileApp();

    const nav = screen.getByRole('navigation', { name: '\u4e3b\u5bfc\u822a' });

    await user.click(within(nav).getByText('\u4efb\u52a1'));
    expect(screen.getByRole('heading', { name: '\u4efb\u52a1' })).toBeInTheDocument();

    await user.click(within(nav).getByText('\u65e5\u5386'));
    expect(screen.getByRole('heading', { name: '\u65e5\u5386' })).toBeInTheDocument();

    await user.click(within(nav).getByText('\u8bbe\u7f6e'));
    expect(screen.getByRole('heading', { name: '\u8bbe\u7f6e' })).toBeInTheDocument();
  });
});
