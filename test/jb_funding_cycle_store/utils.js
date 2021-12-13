export function createFundingCycleData({
  duration = 604800, // 1 week
  weight = 0,
  discountRate = 100000000,
  ballot,
}) {
  return {
    duration,
    weight,
    discountRate,
    ballot,
  };
}
