import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';

const acceptHouseholdInvitation = vi.fn();
const createHouseholdInvitation = vi.fn();

vi.mock('../src/lib/cloud.js', () => ({
  acceptHouseholdInvitation: (...args) => acceptHouseholdInvitation(...args),
  createHouseholdInvitation: (...args) => createHouseholdInvitation(...args),
}));

// Imported after the mock so the component picks up the mocked module.
import HouseholdInvites from '../src/components/HouseholdInvites.jsx';

/**
 * The invitation front door. Everything here rides on the server's existing
 * create/accept routes; the UI's own jobs are gating (valid email, at least
 * one permission, a full-length token), showing the token exactly once, and
 * never letting an error look like a success.
 */

beforeEach(() => {
  cleanup();
  localStorage.clear();
  acceptHouseholdInvitation.mockReset();
  createHouseholdInvitation.mockReset();
});

afterEach(cleanup);

describe('household invitations', () => {
  it('explains what is needed before sign-in instead of showing dead buttons', () => {
    render(<AppProvider><HouseholdInvites /></AppProvider>);
    expect(screen.getByText(/Sign in to invite someone/i)).toBeTruthy();
    expect(screen.queryByLabelText('Invitee email')).toBeNull();
  });

  it('still offers token acceptance while signed out — joining is the other half', () => {
    render(<AppProvider><HouseholdInvites /></AppProvider>);
    const join = screen.getByRole('button', { name: 'Join household' });
    expect(join.disabled).toBe(true);
  });

  it('enables joining only for a full-length token and reports success honestly', async () => {
    acceptHouseholdInvitation.mockResolvedValue({ householdId: 'h1' });
    render(<AppProvider><HouseholdInvites /></AppProvider>);
    const join = screen.getByRole('button', { name: 'Join household' });
    fireEvent.change(screen.getByLabelText('Invitation token to accept'), {
      target: { value: 'short' },
    });
    expect(join.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Invitation token to accept'), {
      target: { value: 'a'.repeat(40) },
    });
    expect(join.disabled).toBe(false);
    fireEvent.click(join);
    await waitFor(() => expect(screen.getByText(/Joined the household/i)).toBeTruthy());
    expect(acceptHouseholdInvitation).toHaveBeenCalledWith('a'.repeat(40));
  });

  it('shows a server rejection instead of pretending the join worked', async () => {
    acceptHouseholdInvitation.mockRejectedValue(new Error('Invitation not found.'));
    render(<AppProvider><HouseholdInvites /></AppProvider>);
    fireEvent.change(screen.getByLabelText('Invitation token to accept'), {
      target: { value: 'b'.repeat(40) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }));
    await waitFor(() => expect(screen.getByText('Invitation not found.')).toBeTruthy());
  });
});
