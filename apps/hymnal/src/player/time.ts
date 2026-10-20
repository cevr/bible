/** `seconds` as a clock reads it: minutes and two-digit seconds (`2:05`), whole seconds down. */
export const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
