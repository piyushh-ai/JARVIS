/**
 * Hardware topology and GPIO safety constraints for ESP32-WROOM-32 + dual 4-channel relays.
 * Relay 1 (GPIO 13, active LOW) is bench-verified; channels 2-8 require explicit per-channel
 * bench configuration before activation.
 */

export const MAX_DUAL_MODULE_RELAYS = 8;

export const RELAY_MODULES = {
  moduleA: { label: "Relay Module A (CH 1-4)", channels: [1, 2, 3, 4] },
  moduleB: { label: "Relay Module B (CH 5-8)", channels: [5, 6, 7, 8] },
};

export const VERIFIED_RELAY_ONE_DEFAULTS = {
  relayNumber: 1,
  gpioPin: 13,
  activeLevel: "LOW",
  safeBootState: "off",
};

// Pins on ESP32-WROOM-32 that must never be driven for relay outputs:
// 6-11: internal SPI flash; 34-39: input-only (no output driver).
export const UNUSABLE_OUTPUT_GPIO_PINS = new Set([
  6, 7, 8, 9, 10, 11, 34, 35, 36, 37, 38, 39,
]);

// Boot strapping & UART0 pins discouraged unless specifically verified on board:
export const DISCOURAGED_BOOTSTRAP_GPIO_PINS = new Set([0, 1, 2, 3, 12, 15]);

export const RECOMMENDED_OUTPUT_GPIO_PINS = [
  13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33,
];

export function isValidOutputGpioPin(pin) {
  return (
    Number.isInteger(pin) &&
    pin >= 0 &&
    pin <= 39 &&
    !UNUSABLE_OUTPUT_GPIO_PINS.has(pin)
  );
}

export function getRelayModuleLabel(relayNumber) {
  if (relayNumber >= 1 && relayNumber <= 4) return RELAY_MODULES.moduleA.label;
  if (relayNumber >= 5 && relayNumber <= 8) return RELAY_MODULES.moduleB.label;
  return `Expansion Channel ${relayNumber}`;
}

