/**
 * /api/trading/order — Place/cancel orders.
 * 
 * POST /api/trading/order — place an order
 * DELETE /api/trading/order — cancel all orders
 */
import { NextRequest, NextResponse } from "next/server";
import { placeOrder, cancelAllOrdersLogged, cancelOrderLogged } from "@/lib/paper/service";

// POST /api/trading/order — place order
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, side, type, qty, notional, limitPrice, stopPrice, takeProfitPrice, stopLossPrice, source } = body;

  if (!symbol || !side || !type) {
    return NextResponse.json(
      { error: "symbol, side, and type are required" },
      { status: 400 }
    );
  }

  try {
    const result = await placeOrder({
      symbol,
      side,
      type,
      qty,
      notional,
      limitPrice,
      stopPrice,
      takeProfitPrice,
      stopLossPrice,
      source,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/trading/order — cancel all
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  try {
    if (orderId) {
      await cancelOrderLogged(orderId);
      return NextResponse.json({ canceled: orderId });
    }

    await cancelAllOrdersLogged();
    return NextResponse.json({ canceled: "all" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
