/**
 * Normalized labels (lowercase) — aligns with stored `Expense.category` after normalization.
 * Used for suggestions, future analytics, and grouping.
 */
const DEFAULT_EXPENSE_CATEGORIES = [
  "transport",
  "fuel",
  "rent",
  "salary",
  "utilities",
  "supplies",
];

module.exports = { DEFAULT_EXPENSE_CATEGORIES };
