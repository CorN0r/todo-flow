import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingOverlay } from '../../components/shared/OnboardingOverlay';
import { renderWithProviders } from '../test-utils';

// Stub localStorage before module loads
const storage: Record<string, string | null> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn(),
});

describe('OnboardingOverlay', () => {
  it('renders the first onboarding step', () => {
    renderWithProviders(<OnboardingOverlay />);
    expect(screen.getByText('Create your first list')).toBeInTheDocument();
  });

  it('has navigation buttons', () => {
    renderWithProviders(<OnboardingOverlay />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Skip all')).toBeInTheDocument();
  });

  it('advances to step 2 on Next click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingOverlay />);
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('Add your first task')).toBeInTheDocument();
  });
});
