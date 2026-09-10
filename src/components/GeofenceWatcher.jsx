import { useEffect, useRef } from 'react';
import { useApp } from '../lib/store.jsx';
import { distanceMetres } from '../lib/smart.js';
import { showNotification } from '../lib/notify.js';

export default function GeofenceWatcher() {
  const app = useApp();
  const inside = useRef(new Map());

  useEffect(() => {
    const places = app.placeReminders.filter((place) => place.on);
    if (!places.length || !navigator.geolocation?.watchPosition) return undefined;
    const activeIds = new Set(places.map((place) => place.id));
    [...inside.current.keys()].forEach((id) => {
      if (!activeIds.has(id)) inside.current.delete(id);
    });
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        places.forEach((place) => {
          const nowInside = distanceMetres(coords, place) <= place.radius;
          const wasInside = inside.current.get(place.id);
          inside.current.set(place.id, nowInside);
          if (nowInside && wasInside === false) {
            showNotification(place.label, {
              body: 'You entered the saved area. Open your shopping list.',
              tag: `place-${place.id}`,
            });
          }
        });
      },
      () => showNotification('Location reminder paused', {
        body: 'Forq could not read your location. Check site permissions before relying on this reminder.',
        tag: 'place-location-error',
      }),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch?.(watchId);
  }, [app.placeReminders]);

  return null;
}
