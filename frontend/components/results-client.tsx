"use client";

import { startTransition, useEffect, useState } from "react";

import { AnalysisResponse, InputMode } from "@/lib/types";

import { ResultPanel } from "./result-panel";
import { SearchForm } from "./search-form";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const API_BASE_URL = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/+$/, "") : "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 12000;

function LoadingCard() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-[2rem] border border-white/10 bg-storm-900/70 p-5 shadow-glow backdrop-blur xl:p-6"
    >
      <span className="sr-only">StormRoute is analyzing the location.</span>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel-surface animate-pulse space-y-4">
          <div className="h-4 w-36 rounded-full bg-white/10" />
          <div className="h-8 w-3/4 rounded-full bg-white/10" />
          <div className="h-20 rounded-[1.5rem] bg-white/10" />
        </div>
        <div className="panel-surface animate-pulse space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-[1.5rem] bg-white/10" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-44 rounded-[1.5rem] bg-white/10" />
            <div className="h-44 rounded-[1.5rem] bg-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") {
        return payload.detail;
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return text;
      }
    }
  } catch {
    return "StormRoute could not analyze that location right now.";
  }

  return "StormRoute could not analyze that location right now.";
}

function normalizeMode(mode: InputMode | string | undefined): InputMode {
  return mode === "address" ? "address" : "zip";
}

interface ResultsClientProps {
  location: string;
  mode?: string;
}

export function ResultsClient({ location, mode }: ResultsClientProps) {
  const normalizedMode = normalizeMode(mode);
  const normalizedLocation = location.trim();

  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(normalizedLocation));

  useEffect(() => {
    if (!normalizedLocation) {
      setError(
        normalizedMode === "address"
          ? "Enter a full U.S. street address to analyze."
          : "Enter a valid U.S. ZIP code to analyze.",
      );
      setResult(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setIsLoading(true);
    setError(null);
    setResult(null);

    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            location: normalizedLocation,
            type: normalizedMode,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const payload = (await response.json()) as AnalysisResponse;
        if (!isCancelled) {
          startTransition(() => {
            setResult(payload);
          });
        }
      } catch (requestError) {
        if (isCancelled) {
          return;
        }
        const message = requestError instanceof DOMException && requestError.name === "AbortError"
          ? "StormRoute took too long to respond. Please try again."
          : requestError instanceof Error
            ? requestError.message
            : "StormRoute could not reach the backend service.";
        setError(message);
        setResult(null);
      } finally {
        if (!isCancelled) {
          window.clearTimeout(timeoutId);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedLocation, normalizedMode]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-storm-fade shadow-glow">
        <div className="grid gap-8 p-6 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
          <div className="panel-surface self-start">
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-storm-300">Update your search</p>
                <h1 className="mt-3 font-display text-3xl text-white">Results view</h1>
                <p className="mt-3 text-sm leading-6 text-storm-200">
                  Run the analysis again with a different ZIP code or full U.S. street address.
                </p>
              </div>
              <SearchForm
                initialLocation={normalizedLocation}
                initialMode={normalizedMode}
                submitLabel="Run New Analysis"
              />
            </div>
          </div>

          <div className="panel-surface">
            <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Current request</p>
            <h2 className="mt-3 font-display text-3xl text-white">{normalizedLocation || "No location provided"}</h2>
            <p className="mt-4 text-sm leading-6 text-storm-200">
              {normalizedMode === "zip"
                ? "StormRoute is treating this request as a ZIP-code analysis."
                : "StormRoute is treating this request as a full street-address analysis."}
            </p>

            {error ? (
              <div role="alert" className="mt-6 rounded-3xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isLoading ? <LoadingCard /> : null}
      {result && !isLoading ? <ResultPanel result={result} /> : null}
    </main>
  );
}
