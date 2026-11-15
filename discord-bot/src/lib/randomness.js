/** The fixed pool of Magic 8-Ball answers, half affirmative and half negative/hazy. */
export const EIGHT_BALL_RESPONSES = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

/**
 * Picks a uniformly random Magic 8-Ball answer from EIGHT_BALL_RESPONSES.
 *
 * @returns {string} One of the 20 canned 8-Ball responses.
 * @throws {never} Pure random selection.
 * @example
 * pick8BallResponse(); // e.g. "It is certain."
 */
export function pick8BallResponse() {
  return EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)];
}

/**
 * Flips a fair coin.
 *
 * @returns {"Heads" | "Tails"} The side of the coin that came up.
 * @throws {never} Pure random selection.
 * @example
 * flipCoin(); // e.g. "Heads"
 */
export function flipCoin() {
  return Math.random() < 0.5 ? "Heads" : "Tails";
}
