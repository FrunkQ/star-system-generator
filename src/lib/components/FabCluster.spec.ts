import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import FabCluster from './FabCluster.svelte';

const actions = [
  { id: 'add-planet', label: 'Add planet here' },
  { id: 'reset', label: 'Reset view', icon: '↺' }
];

describe('FabCluster', () => {
  it('hides secondary actions until the primary FAB is tapped', async () => {
    const { queryByText, getByLabelText } = render(FabCluster, { props: { actions } });
    expect(queryByText('Add planet here')).toBeNull();
    await fireEvent.click(getByLabelText('Actions'));
    expect(queryByText('Add planet here')).toBeTruthy();
  });

  it('emits the action id and collapses when a secondary FAB is picked', async () => {
    const action = vi.fn();
    const { getByText, getByLabelText, queryByText } = render(FabCluster, {
      props: { actions, open: true },
      events: { action }
    });
    await fireEvent.click(getByText('Add planet here'));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ detail: 'add-planet' }));
    expect(queryByText('Add planet here')).toBeNull(); // collapsed
    expect(getByLabelText('Actions')).toBeTruthy(); // primary back to closed label
  });

  it('falls back to the first label letter when no icon is given', async () => {
    const { getByText } = render(FabCluster, { props: { actions, open: true } });
    expect(getByText('A')).toBeTruthy(); // "Add planet here" -> "A"
    expect(getByText('↺')).toBeTruthy(); // explicit icon kept
  });
});
