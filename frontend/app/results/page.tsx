import { ResultsClient } from "@/components/results-client";

interface ResultsPageProps {
  searchParams: Promise<{
    location?: string | string[];
    type?: string | string[];
  }>;
}

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const params = await searchParams;
  return (
    <ResultsClient
      location={firstQueryValue(params.location)}
      mode={firstQueryValue(params.type)}
    />
  );
}
