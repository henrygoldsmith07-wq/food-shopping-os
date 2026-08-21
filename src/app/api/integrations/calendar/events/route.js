import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../../../server/api.js';
import { calendarAccount } from '../../../../../server/calendar.js';
import { calendarEventSchema, calendarRangeSchema } from '../../../../../server/schemas.js';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`calendar:${user.id}`, 60, 3600000);
    const input = calendarEventSchema.parse(await request.json());
    const accessToken = await calendarAccount(user, input.provider);
    const isGoogle = input.provider === 'google';
    const endpoint = isGoogle
      ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      : 'https://graph.microsoft.com/v1.0/me/events';
    const payload = isGoogle
      ? {
          summary: input.title,
          description: input.notes,
          start: { dateTime: input.start },
          end: { dateTime: input.end },
        }
      : {
          subject: input.title,
          body: { contentType: 'text', content: input.notes || '' },
          start: { dateTime: input.start, timeZone: 'UTC' },
          end: { dateTime: input.end, timeZone: 'UTC' },
        };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new ApiError(502, 'The calendar provider rejected the event.');
    const event = await response.json();
    return NextResponse.json({ id: event.id, url: event.htmlLink || event.webLink || null }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const googleEvents = (payload) => (payload.items || [])
  .filter((event) => event.status !== 'cancelled' && event.transparency !== 'transparent')
  .map((event) => ({
    id: event.id,
    title: event.summary || 'Busy',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date),
  }));

const microsoftEvents = (payload) => (payload.value || [])
  .filter((event) => !event.isCancelled && event.showAs !== 'free')
  .map((event) => ({
    id: event.id,
    title: event.subject || 'Busy',
    start: event.start?.dateTime,
    end: event.end?.dateTime,
    allDay: Boolean(event.isAllDay),
  }));

export async function GET(request) {
  try {
    const user = await requireUser();
    await rateLimit(`calendar:read:${user.id}`, 60, 3600000);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const input = calendarRangeSchema.parse(query);
    const accessToken = await calendarAccount(user, input.provider);
    const isGoogle = input.provider === 'google';
    const endpoint = isGoogle
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin: input.from,
          timeMax: input.to,
          singleEvents: 'true',
          maxResults: '2500',
          fields: 'items(id,summary,status,transparency,start,end)',
        })}`
      : `https://graph.microsoft.com/v1.0/me/calendarView?${new URLSearchParams({
          startDateTime: input.from,
          endDateTime: input.to,
          $select: 'id,subject,start,end,isAllDay,isCancelled,showAs',
          $top: '1000',
        })}`;
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(isGoogle ? {} : { Prefer: 'outlook.timezone="UTC"' }),
      },
    });
    if (!response.ok) throw new ApiError(502, 'The calendar provider rejected the availability request.');
    const payload = await response.json();
    return NextResponse.json({ events: isGoogle ? googleEvents(payload) : microsoftEvents(payload) });
  } catch (error) {
    return handleApiError(error);
  }
}
