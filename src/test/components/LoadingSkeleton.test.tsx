import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { LoadingSkeleton, CalendarSkeleton, DetailSkeleton } from '../../components/shared/LoadingSkeleton';
import { renderWithProviders } from '../test-utils';

describe('LoadingSkeleton', () => {
  it('renders default count of 3 rows', () => {
    renderWithProviders(<LoadingSkeleton />);
    // 3 skeleton bars + 1 sr-only span
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3);
  });

  it('respects the count prop', () => {
    const { container } = renderWithProviders(<LoadingSkeleton count={5} />);
    expect(container.querySelectorAll('div.animate-pulse').length).toBe(5);
  });

  it('has status role for accessibility', () => {
    renderWithProviders(<LoadingSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('CalendarSkeleton', () => {
  it('renders calendar grid', () => {
    renderWithProviders(<CalendarSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('DetailSkeleton', () => {
  it('renders detail skeleton', () => {
    renderWithProviders(<DetailSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
