import { Client } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger';

// Track which event names have already been registered to prevent duplicates
const registeredEvents = new Set<string>();

function registerEvent(client: Client, event: any, filename: string) {
  if (!event?.name || !event?.execute) return;

  // For interactionCreate: only allow ONE handler (from interactionCreate.ts)
  // This prevents double-handling when multiple files export the same event name
  if (event.name === 'interactionCreate' && filename !== 'interactionCreate.ts' && filename !== 'interactionCreate.js') {
    logger.warn(`Skipping duplicate interactionCreate handler in ${filename}`);
    return;
  }

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  logger.info(`Loaded event: ${event.name} (from ${filename})`);
}

export async function loadEvents(client: Client) {
  const eventsPath = join(__dirname, '../events');
  const eventFiles = readdirSync(eventsPath).filter(
    (file) => file.endsWith('.js') && !file.endsWith('.d.ts')
  );

  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    const mod = require(filePath);

    // Handle files that export a single event at top level (name + execute)
    if (mod.name && mod.execute) {
      registerEvent(client, mod, file);
    }

    // Handle files that export multiple named events (e.g. logEvents.ts)
    for (const key of Object.keys(mod)) {
      const exp = mod[key];
      if (exp && typeof exp === 'object' && exp.name && exp.execute && exp !== mod) {
        registerEvent(client, exp, file);
      }
    }
  }
}
