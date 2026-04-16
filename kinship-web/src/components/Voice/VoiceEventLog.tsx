import { useState, JSX } from "react";

function Event({ event, timestamp }: { event: any; timestamp: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isClient = event.event_id && !event.event_id.startsWith("event_");

  // Get event type styling
  const getEventTypeStyle = (eventType: string) => {
    if (eventType.includes("function_call")) {
      return "bg-purple-50 border-purple-200 text-purple-800";
    }
    if (eventType.includes("session")) {
      return "bg-blue-50 border-blue-200 text-blue-800";
    }
    if (eventType.includes("conversation")) {
      return "bg-green-50 border-green-200 text-green-800";
    }
    if (eventType.includes("response")) {
      return "bg-orange-50 border-orange-200 text-orange-800";
    }
    return "bg-gray-50 border-gray-200 text-gray-800";
  };

  const getDirectionIcon = (isClient: boolean) => {
    return isClient ? "👤" : "🤖";
  };

  return (
    <div
      className={`group rounded-lg border transition-all duration-200 hover:shadow-sm ${isClient ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"
        }`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-shrink-0">
          <span className="text-lg">{getDirectionIcon(isClient)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getEventTypeStyle(event.type)}`}
            >
              {event.type}
            </span>
            {event.name && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-800">
                {event.name}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {isClient ? "Client" : "Server"} • {timestamp}
          </div>
        </div>

        <div className="flex-shrink-0">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-transform duration-200 ${isExpanded ? "rotate-180" : ""
              } ${isClient ? "bg-blue-200 text-blue-700" : "bg-green-200 text-green-700"}`}
          >
            {isExpanded ? "↑" : "↓"}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          <div className="p-4">
            <div className="text-xs text-gray-500 mb-2 font-medium">
              Event Details:
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border overflow-x-auto">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(event, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface VoiceEventLogProps {
  events: any[];
}

export default function VoiceEventLog({ events }: VoiceEventLogProps) {
  const eventsToDisplay: JSX.Element[] = [];
  let deltaEvents: { [key: string]: any } = {};

  events.forEach((event) => {
    if (event.type.endsWith("delta")) {
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(
      <Event key={event.event_id} event={event} timestamp={event.timestamp} />,
    );
  });

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <span className="text-2xl">🎤</span>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No conversation yet
        </h3>
        <p className="text-gray-500 text-sm max-w-sm">
          Start a voice session to begin real-time AI interaction. Events will
          appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </div>
        <div className="text-xs text-gray-400">Latest events at top</div>
      </div>
      {eventsToDisplay}
    </div>
  );
}
