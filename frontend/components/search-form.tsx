"use client";

import { useId, useState } from "react";

import { InputMode } from "@/lib/types";

import { AddressAutocompleteField } from "./address-autocomplete-field";

function normalizeMode(mode: InputMode | string | undefined): InputMode {
  return mode === "address" ? "address" : "zip";
}

function normalizeZipInput(value: string): string {
  const compact = value.replace(/[^\d-]/g, "");
  const [head = "", ...tailParts] = compact.split("-");
  const normalizedHead = head.slice(0, 5);
  const normalizedTail = tailParts.join("").slice(0, 4);
  return normalizedTail ? `${normalizedHead}-${normalizedTail}` : normalizedHead;
}

interface SearchFormProps {
  action?: string;
  initialLocation?: string;
  initialMode?: InputMode | string;
  submitLabel?: string;
}

export function SearchForm({
  action = "/results",
  initialLocation = "",
  initialMode = "zip",
  submitLabel = "Analyze Risk",
}: SearchFormProps) {
  const normalizedInitialMode = normalizeMode(initialMode);
  const [mode, setMode] = useState<InputMode>(normalizedInitialMode);
  const [zipLocation, setZipLocation] = useState(normalizedInitialMode === "zip" ? initialLocation : "");
  const [addressLocation, setAddressLocation] = useState(normalizedInitialMode === "address" ? initialLocation : "");
  const helpId = useId();

  return (
    <form action={action} method="get" className="space-y-5">
      <input type="hidden" name="type" value={mode} />

      <div className="space-y-3">
        <label htmlFor={mode === "zip" ? "location-zip" : "location-address"} className="text-sm text-storm-200">
          {mode === "zip" ? "5-digit U.S. ZIP code or ZIP+4" : "Full U.S. street address"}
        </label>

        {mode === "zip" ? (
          <input
            id="location-zip"
            name="location"
            type="text"
            className="storm-input"
            placeholder="20105"
            aria-describedby={helpId}
            autoCapitalize="off"
            autoComplete="postal-code"
            autoCorrect="off"
            inputMode="numeric"
            maxLength={10}
            pattern="[0-9]{5}(-[0-9]{4})?"
            required
            spellCheck={false}
            title="Enter a 5-digit U.S. ZIP code or ZIP+4."
            value={zipLocation}
            onChange={(event) => setZipLocation(normalizeZipInput(event.target.value))}
          />
        ) : (
          <AddressAutocompleteField
            describedBy={helpId}
            id="location-address"
            name="location"
            value={addressLocation}
            onChange={setAddressLocation}
          />
        )}
      </div>

      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Choose whether StormRoute should analyze a ZIP code or a street address</legend>
        {(["zip", "address"] as InputMode[]).map((option) => {
          const selected = mode === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={selected}
              className={`rounded-2xl px-4 py-2 text-sm transition ${
                selected
                  ? "border border-surge-300/50 bg-surge-500/15 text-surge-300"
                  : "border border-white/10 bg-white/5 text-storm-200 hover:bg-white/10"
              }`}
            >
              {option === "zip" ? "ZIP Code" : "Street Address"}
            </button>
          );
        })}
      </fieldset>

      <div id={helpId} className="rounded-3xl border border-white/10 bg-black/15 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Input guidance</p>
        <p className="mt-2 text-sm leading-6 text-storm-100">
          {mode === "zip"
            ? "ZIP analysis covers broader local weather conditions. Enter a valid 5-digit U.S. ZIP code or ZIP+4."
            : "Address analysis expects a complete street address and can add location-specific tree context when conditions warrant it."}
        </p>
      </div>

      <button type="submit" className="storm-button w-full">
        {submitLabel}
      </button>
    </form>
  );
}
