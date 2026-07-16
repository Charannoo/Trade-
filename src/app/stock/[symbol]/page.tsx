import { StockPageContent } from "@/components/StockPageContent";

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  return (
    <div className="space-y-6">
      <StockPageContent symbol={upperSymbol} />
    </div>
  );
}
