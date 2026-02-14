"use client";

import { useState } from "react";
import type { DueFromMeItem } from "@/types";

type ItemCardProps = {
  item: DueFromMeItem;
  showBlockedPerson?: boolean;
  showOwner?: boolean;
  onActionComplete?: () => void;
};

const typeColors = {
  reply: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  approval: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  decision: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  follow_up: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const typeLabels = {
  reply: "Reply",
  approval: "Approval",
  decision: "Decision",
  follow_up: "Follow-up",
};

export function ItemCard({ item, showBlockedPerson, showOwner, onActionComplete }: ItemCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showDictate, setShowDictate] = useState(false);

  async function handleAction(action: "done" | "snooze" | "ignore") {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/items/${item.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, snoozeDays: 1 }),
      });

      if (res.ok) {
        onActionComplete?.();
      } else {
        console.error("Action failed");
      }
    } catch (err) {
      console.error("Action error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColors[item.type]}`}
            >
              {typeLabels[item.type]}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {item.agingDays} days
            </span>
          </div>

          {/* Title / Subject */}
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {item.title}
          </h3>

          {/* Who is blocked / Owner */}
          {showBlockedPerson && item.blockingWho && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Blocking: {item.blockingWho}
            </p>
          )}
          {showOwner && item.ownerEmail && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Owner: {item.ownerEmail}
            </p>
          )}

          {/* Rationale */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {item.rationale}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* Primary action depends on type */}
          {(item.type === "reply" || item.type === "follow_up") ? (
            <button 
              onClick={() => setShowDictate(!showDictate)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              <MicIcon className="h-3 w-3" />
              {showDictate ? "Close" : "Respond"}
            </button>
          ) : (
            <button 
              onClick={() => handleAction("done")}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isLoading ? "..." : (item.suggestedAction || "Mark Done")}
            </button>
          )}
        </div>
      </div>

      {/* Dictation panel */}
      {showDictate && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <DictationPanel 
            itemId={item.id} 
            sourceId={item.sourceId}
            onComplete={() => {
              setShowDictate(false);
              onActionComplete?.();
            }} 
          />
        </div>
      )}

      {/* Confidence score */}
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Confidence: {item.confidenceScore}%
        </span>
        <div className="flex gap-3">
          {(item.type === "reply" || item.type === "follow_up") && (
            <button 
              onClick={() => handleAction("done")}
              disabled={isLoading}
              className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
            >
              Done
            </button>
          )}
          <button 
            onClick={() => handleAction("snooze")}
            disabled={isLoading}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
          >
            Snooze
          </button>
          <button 
            onClick={() => handleAction("ignore")}
            disabled={isLoading}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}

function DictationPanel({ itemId, sourceId, onComplete }: { itemId: string; sourceId: string; onComplete: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function startRecording() {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setStatus("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecording(true);
      setTranscript("");
      setStatus("Listening...");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript);
    };

    recognition.onerror = (event: any) => {
      setStatus(`Error: ${event.error}`);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    (window as any)._recognition = recognition;
    recognition.start();
  }

  async function stopAndCreateDraft() {
    if ((window as any)._recognition) {
      (window as any)._recognition.stop();
    }

    if (!transcript.trim()) {
      setStatus("No speech detected");
      return;
    }

    setIsProcessing(true);
    setStatus("Creating draft...");

    try {
      const res = await fetch("/api/drafts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: sourceId,
          transcript: transcript.trim(),
        }),
      });

      if (res.ok) {
        setStatus("Draft created! Check Gmail.");
        setTimeout(onComplete, 1500);
      } else {
        const data = await res.json();
        setStatus(data.error || "Failed to create draft");
      }
    } catch (err) {
      setStatus("Failed to create draft");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopAndCreateDraft}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 animate-pulse"
          >
            Stop & Create Draft
          </button>
        )}
      </div>

      {transcript && (
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
          <span className="font-medium">Transcript:</span> {transcript}
        </div>
      )}

      {status && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{status}</p>
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
      />
    </svg>
  );
}
