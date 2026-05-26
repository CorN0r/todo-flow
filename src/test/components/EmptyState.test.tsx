import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { EmptyState } from '../../components/shared/EmptyState';
import { renderWithProviders } from '../test-utils';

describe('EmptyState', () => {
  it('renders the title', () => {
    renderWithProviders(
      <EmptyState icon={<span data-testid="icon">!</span>} title="Nothing here" />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders the icon', () => {
    renderWithProviders(
      <EmptyState icon={<span data-testid="icon">!</span>} title="Empty" />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    renderWithProviders(
      <EmptyState icon={<span />} title="Empty" description="Add something to get started" />,
    );
    expect(screen.getByText('Add something to get started')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = renderWithProviders(
      <EmptyState icon={<span />} title="Empty" />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(1); // Only the title paragraph
  });
});
