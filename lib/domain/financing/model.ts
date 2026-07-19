export type FinancingSelection = {
  confirmationRequired: boolean;
  discounting: boolean;
  forfaiting: boolean;
};

export function assertValidFinancingSelection(selection: FinancingSelection): void {
  if (selection.discounting && selection.forfaiting) {
    throw new Error('Discounting and forfaiting are alternative early-payment selections.');
  }
}
