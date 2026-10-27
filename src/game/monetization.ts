// Stubs for monetization. Swap these for a real store and ad SDK when packaging with Capacitor.
export async function purchaseAutoUnlock(): Promise<boolean> {
  return true;
}

export async function showRewardedAd(): Promise<boolean> {
  return true;
}

export const AUTO_PRICE_LABEL = '$4.99';

export async function purchaseFastRaces(): Promise<boolean> {
  return true;
}

// Stub: a real build would run the store checkout for this price point.
export async function purchasePack(_price: number): Promise<boolean> {
  return true;
}

export const FAST_RACES_PRICE_LABEL = '$2.50';
