export function optimizeSessionsForStorage(data = []) {
  if (!Array.isArray(data)) return [];

  return data.map((session) => ({
    ...session,
    messages: Array.isArray(session.messages)
      ? session.messages.map((message) => {
          if (message.attachments && message.attachments.length > 0) {
            return {
              ...message,
              attachments: message.attachments.map((attachment) => ({
                ...attachment,
                data: undefined,
              })),
            };
          }
          return message;
        })
      : [],
  }));
}

export function hasUserConversation(data = []) {
  if (!Array.isArray(data)) return false;
  return data.some((session) => (
    Array.isArray(session.messages)
    && session.messages.some((message) => message.role === 'user')
  ));
}

function parseTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function parseSessionIdTime(id) {
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const time = Number(id);
  const minReasonable = Date.UTC(2020, 0, 1);
  const maxReasonable = Date.UTC(2100, 0, 1);
  return Number.isFinite(time) && time >= minReasonable && time <= maxReasonable
    ? time
    : null;
}

export function getLatestUserActivityTime(data = []) {
  if (!Array.isArray(data)) return null;

  let latest = null;

  data.forEach((session) => {
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const hasUserMessage = messages.some((message) => message.role === 'user');

    messages.forEach((message) => {
      if (message.role !== 'user') return;
      const messageTime = parseTime(message.timestamp);
      if (messageTime !== null && (latest === null || messageTime > latest)) {
        latest = messageTime;
      }
    });

    if (hasUserMessage) {
      const sessionTime = parseSessionIdTime(session.id);
      if (sessionTime !== null && (latest === null || sessionTime > latest)) {
        latest = sessionTime;
      }
    }
  });

  return latest;
}

export function shouldIgnoreIncomingMemory({
  existingMessages = [],
  existingUpdatedAt,
  incomingMessages = [],
} = {}) {
  if (hasUserConversation(existingMessages)) return false;

  const clearMarkerTime = parseTime(existingUpdatedAt);
  const incomingActivityTime = getLatestUserActivityTime(incomingMessages);

  return (
    clearMarkerTime !== null
    && incomingActivityTime !== null
    && incomingActivityTime <= clearMarkerTime
  );
}

export function shouldUsePersistedSessions({ sessions = [], clearedAt } = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) return false;

  const clearMarkerTime = parseTime(clearedAt);
  if (clearMarkerTime === null) return true;
  if (!hasUserConversation(sessions)) return false;

  const latestActivityTime = getLatestUserActivityTime(sessions);
  return latestActivityTime !== null && latestActivityTime > clearMarkerTime;
}
