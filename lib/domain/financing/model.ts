export const solutionKinds = [
  'confirmationOnly',
  'confirmationWithDiscounting',
  'discountingOnly',
  'forfaitingOnly',
  'confirmationWithForfaiting',
] as const;

export type SolutionKind = (typeof solutionKinds)[number];

export const solutionLabels: Record<SolutionKind, string> = {
  confirmationOnly: 'Confirmation only',
  confirmationWithDiscounting: 'Confirmation + discounting',
  discountingOnly: 'Discounting only',
  forfaitingOnly: 'Forfaiting only',
  confirmationWithForfaiting: 'Confirmation + forfaiting',
};

export function isConfirmationSolution(solution: SolutionKind): boolean {
  return (
    solution === 'confirmationOnly' ||
    solution === 'confirmationWithDiscounting' ||
    solution === 'confirmationWithForfaiting'
  );
}

export function isEarlyPaymentSolution(solution: SolutionKind): boolean {
  return solution !== 'confirmationOnly';
}
