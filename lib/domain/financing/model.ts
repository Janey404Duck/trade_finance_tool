export const financingComponents = [
  'confirmation',
  'discounting',
  'forfaiting',
] as const;

export type FinancingComponent = (typeof financingComponents)[number];

export type ComparisonCase = {
  id: string;
  label: string;
  components: FinancingComponent[];
};

export function assertValidComparisonCase(comparisonCase: ComparisonCase): void {
  if (!comparisonCase.id.trim() || !comparisonCase.label.trim()) {
    throw new Error('Every comparison case requires an id and label.');
  }
  if (comparisonCase.components.length === 0) {
    throw new Error(`Comparison case "${comparisonCase.label}" must select at least one component.`);
  }
  if (new Set(comparisonCase.components).size !== comparisonCase.components.length) {
    throw new Error(`Comparison case "${comparisonCase.label}" contains duplicate components.`);
  }
  if (hasComponent(comparisonCase, 'discounting') && hasComponent(comparisonCase, 'forfaiting')) {
    throw new Error('Discounting and forfaiting are alternative early-payment components.');
  }
}

export function hasComponent(
  comparisonCase: ComparisonCase,
  component: FinancingComponent,
): boolean {
  return comparisonCase.components.includes(component);
}
