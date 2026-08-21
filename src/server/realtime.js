import Ably from 'ably';
import { databaseConfigured, getDatabase } from './database.js';

export async function publishHousehold(householdId, event) {
  if (process.env.ABLY_API_KEY) {
    try {
      const client = new Ably.Rest(process.env.ABLY_API_KEY);
      await client.channels.get(`household:${householdId}`).publish('changed', event);
      return;
    } catch (error) {
      console.error('Forq Ably publish failed; using Redis fallback', { householdId, message: error.message });
    }
  }
  if (databaseConfigured) {
    try {
      await (await getDatabase()).collection('realtimeEvents').insertOne({
        householdId,
        event,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    } catch (error) {
      console.error('Forq Redis realtime publish failed', { householdId, message: error.message });
    }
  }
}
