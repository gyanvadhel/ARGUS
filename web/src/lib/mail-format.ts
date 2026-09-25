/** "PayPal <service@paypal.com>" becomes "PayPal"; a bare address stays as it is. Safe to use in the browser. */
export function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return match ? match[1].trim() : from.trim();
}
