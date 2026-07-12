import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingOverlay } from '../../components/shared/OnboardingOverlay';
import { renderWithProviders } from '../test-utils';

const storage: Record<string, string | null> = {};

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
});

describe('OnboardingOverlay', () => {
  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
  });

  it('renders the first onboarding step', () => {
    renderWithProviders(<OnboardingOverlay />);
    expect(screen.getByText('\u521b\u5efa\u4f60\u7684\u7b2c\u4e00\u4e2a\u6807\u7b7e')).toBeInTheDocument();
  });

  it('has navigation buttons', () => {
    renderWithProviders(<OnboardingOverlay />);
    expect(screen.getByText('\u4e0b\u4e00\u6b65')).toBeInTheDocument();
    expect(screen.getByText('\u8df3\u8fc7')).toBeInTheDocument();
  });

  it('advances to step 2 on Next click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingOverlay />);
    await user.click(screen.getByText('\u4e0b\u4e00\u6b65'));
    expect(screen.getByText('\u6dfb\u52a0\u4f60\u7684\u7b2c\u4e00\u4e2a\u4efb\u52a1')).toBeInTheDocument();
  });
});
