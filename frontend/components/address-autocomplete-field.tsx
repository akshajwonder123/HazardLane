"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "").trim();

interface AutofillRetrieveResponse {
  features: Array<{
    properties: Record<string, unknown>;
  }>;
}

interface AutofillWrapperProps {
  accessToken: string;
  children: ReactNode;
  interceptSearch: (searchText: string) => string;
  onRetrieve: (response: AutofillRetrieveResponse) => void;
  onSuggestError: () => void;
  options: {
    country: string;
    language: string;
    limit: number;
    streets: boolean;
  };
}

interface AddressAutocompleteFieldProps {
  describedBy: string;
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}

function buildRetrievedAddress(properties: Record<string, unknown>): string {
  const fullAddress = typeof properties.full_address === "string" ? properties.full_address.trim() : "";
  if (fullAddress) {
    return fullAddress;
  }

  return [
    typeof properties.address_line1 === "string" ? properties.address_line1.trim() : "",
    typeof properties.address_level2 === "string" ? properties.address_level2.trim() : "",
    typeof properties.address_level1 === "string" ? properties.address_level1.trim() : "",
    typeof properties.postcode === "string" ? properties.postcode.trim() : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function AddressAutocompleteField({
  describedBy,
  id,
  name,
  value,
  onChange,
}: AddressAutocompleteFieldProps) {
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [AutofillComponent, setAutofillComponent] = useState<ComponentType<AutofillWrapperProps> | null>(null);
  const hasToken = MAPBOX_TOKEN.length > 0;

  useEffect(() => {
    let isActive = true;

    if (!hasToken) {
      setAutofillComponent(null);
      return () => {
        isActive = false;
      };
    }

    void import("@mapbox/search-js-react")
      .then((module) => {
        if (isActive) {
          setAutofillComponent(() => module.AddressAutofill as ComponentType<AutofillWrapperProps>);
        }
      })
      .catch(() => {
        if (isActive) {
          setSuggestError(
            "Autocomplete could not load right now. You can still enter the full address manually.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [hasToken]);

  const input = (
    <input
      id={id}
      name={name}
      type="text"
      className="storm-input"
      placeholder="1600 Pennsylvania Avenue NW Washington DC 20500"
      aria-describedby={describedBy}
      autoCapitalize="words"
      autoComplete="shipping street-address"
      autoCorrect="off"
      minLength={8}
      required
      spellCheck={false}
      value={value}
      onChange={(event) => {
        if (suggestError) {
          setSuggestError(null);
        }
        onChange(event.target.value);
      }}
    />
  );

  return (
    <div className="space-y-3">
      {hasToken && AutofillComponent ? (
        <AutofillComponent
          accessToken={MAPBOX_TOKEN}
          options={{
            country: "US",
            language: "en",
            limit: 5,
            streets: false,
          }}
          interceptSearch={(searchText) => {
            const normalized = searchText.trim();
            return normalized.length >= 4 && /\d/.test(normalized) ? normalized : "";
          }}
          onRetrieve={(response) => {
            const [feature] = response.features;
            if (!feature) {
              return;
            }
            const normalizedAddress = buildRetrievedAddress(feature.properties as Record<string, unknown>);
            if (normalizedAddress) {
              onChange(normalizedAddress);
            }
            setSuggestError(null);
          }}
          onSuggestError={() => {
            setSuggestError(
              "Autocomplete suggestions are temporarily unavailable. You can still enter the full address manually.",
            );
          }}
        >
          {input}
        </AutofillComponent>
      ) : (
        input
      )}

      <p className="text-xs leading-5 text-storm-300">
        {hasToken
          ? "Pick a suggestion to store a clean street address before opening results."
          : "Add VITE_MAPBOX_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN to enable Mapbox address autocomplete. Manual entry still works."}
      </p>

      {suggestError ? (
        <p role="status" className="rounded-2xl border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-storm-100">
          {suggestError}
        </p>
      ) : null}
    </div>
  );
}
