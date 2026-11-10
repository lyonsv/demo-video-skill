// Theme detection: the first theme whose keywords appear in a comment wins.
// Deliberately simple and deterministic, so a recording gives the same digest every take.
const THEMES = [
  { name: 'Search', words: ['search', 'filter', 'find', 'results', 'sort'] },
  { name: 'Performance', words: ['slow', 'load', 'lag', 'freez', 'spinner', 'fast'] },
  { name: 'Billing', words: ['price', 'invoice', 'charge', 'billing', 'plan', 'refund'] },
  { name: 'Mobile', words: ['phone', 'mobile', 'ios', 'android', 'tablet'] },
  { name: 'Onboarding', words: ['sign up', 'signup', 'setup', 'set up', 'tutorial', 'invite'] },
  { name: 'Other', words: [] },
];

const themeOf = (text) => {
  const lower = text.toLowerCase();
  return (THEMES.find((t) => t.words.some((w) => lower.includes(w))) || THEMES[THEMES.length - 1]).name;
};

module.exports = { THEMES, themeOf };
