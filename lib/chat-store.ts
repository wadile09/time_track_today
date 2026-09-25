// Shared chat store — persisted via a singleton file written outside of the route handler module.
// This module is imported by the route, and Node.js caches the module,
// so the same `messages` array is shared across all requests in the same process.

let messages: any[] = [];

export function getMessages(): any[] {
  return messages;
}

export function addMessage(msg: any) {
  messages.push(msg);
}

export function updateMessages(updater: (msgs: any[]) => any[]) {
  messages = updater(messages);
}
