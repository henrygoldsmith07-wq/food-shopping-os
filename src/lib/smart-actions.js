import { uid } from './state.js';

const coordinate = (value, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export const smartActions = (set) => ({
  addPlaceReminder: ({ label, latitude, longitude, radius = 200 }) =>
    set((state) => {
      const lat = coordinate(latitude, -90, 90);
      const lon = coordinate(longitude, -180, 180);
      if (lat === null || lon === null || state.placeReminders.length >= 12) return {};
      return {
        placeReminders: [...state.placeReminders, {
          id: uid('gr'),
          label: String(label || 'Shopping reminder').trim().slice(0, 60) || 'Shopping reminder',
          latitude: lat,
          longitude: lon,
          radius: Math.max(50, Math.min(1000, Number(radius) || 200)),
          on: true,
        }],
      };
    }),
  togglePlaceReminder: (id) =>
    set((state) => ({
      placeReminders: state.placeReminders.map((place) => (place.id === id ? { ...place, on: !place.on } : place)),
    })),
  removePlaceReminder: (id) =>
    set((state) => ({ placeReminders: state.placeReminders.filter((place) => place.id !== id) })),
});
