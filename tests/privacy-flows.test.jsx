import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import PrivacyPanel from '../src/components/PrivacyPanel.jsx';
import App from '../src/App.jsx';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('privacy and server deletion', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('shows the complete data boundary on one screen', async () => {
    const request = vi.fn().mockResolvedValue(json({ enabled: true, authenticated: false }));
    render(<PrivacyPanel request={request} signOutUser={vi.fn()} />);

    expect(screen.getByText('Stored on this device')).toBeTruthy();
    expect(screen.getByText('Stored on Forq’s servers after sign-in')).toBeTruthy();
    expect(screen.getByText('Transmitted when you choose a service')).toBeTruthy();
    expect(screen.getByText(/OpenAI receives your prompt/)).toBeTruthy();
    expect(screen.getByText(/Upstash Redis stores your sign-in identity/)).toBeTruthy();
    expect(screen.getByText(/Receipt files you explicitly upload/)).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledWith(
      '/api/backend/status',
      { credentials: 'same-origin' },
    ));
  });

  it('opens the disclosure from Your data', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start using Forq'));
    fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Privacy, storage & deletion' }));

    expect(screen.getByRole('dialog', { name: 'Privacy & data' })).toBeTruthy();
    expect(screen.getByText('Stored on this device')).toBeTruthy();
  });

  it('confirms, deletes the selected server household and keeps the local copy', async () => {
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({
      householdId: 'household-1',
      version: 4,
      deviceId: 'device-1',
    }));
    localStorage.setItem('forq-state-v2', '{"onboarded":true}');
    const request = vi.fn()
      .mockResolvedValueOnce(json({ enabled: true, authenticated: true }))
      .mockResolvedValueOnce(json([{
        id: 'household-1',
        name: 'Home',
        role: 'owner',
        personal: true,
      }]))
      .mockResolvedValueOnce(json({ deleted: true, householdId: 'household-1' }));
    const signOutUser = vi.fn().mockResolvedValue(undefined);
    render(<PrivacyPanel request={request} signOutUser={signOutUser} />);

    await screen.findByText('Selected: Home · owner');
    fireEvent.click(screen.getByRole('button', { name: 'Delete server household' }));
    expect(screen.getByText(/cannot be undone for any household member/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await screen.findByText('Server household deleted. The copy in this browser remains.');
    expect(request).toHaveBeenLastCalledWith('/api/households', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-forq-household-id': 'household-1',
      },
    });
    expect(localStorage.getItem('forq-cloud-meta-v1')).toBeNull();
    expect(localStorage.getItem('forq-state-v2')).toBe('{"onboarded":true}');
    expect(signOutUser).toHaveBeenCalledWith({ redirect: false });
  });
});
