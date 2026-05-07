import { Client } from 'discord.js';

let _client: Client;

export function setDiscordClient(client: Client) { _client = client; }
export function getDiscordClient(): Client { return _client; }
