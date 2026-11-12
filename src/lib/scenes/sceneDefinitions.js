/**
 * Canonical smart scene presets for JARVIS dashboard and backend resolution.
 */
export const SMART_SCENES = Object.freeze([
  Object.freeze({
    id: "good_morning",
    name: "Good Morning",
    badge: "Morning",
    description: "Main Light ON · Mandir Light ON",
    targetMode: "named_lights_on",
  }),
  Object.freeze({
    id: "good_night",
    name: "Good Night",
    badge: "Sleep",
    description: "All devices OFF",
    targetMode: "all_devices_off",
  }),
  Object.freeze({
    id: "away_mode",
    name: "Away Mode",
    badge: "Security",
    description: "All devices OFF",
    targetMode: "all_devices_off",
  }),
  Object.freeze({
    id: "all_lights_on",
    name: "All Lights ON",
    badge: "Lights",
    description: "Only LIGHT devices ON",
    targetMode: "type_light_on",
  }),
  Object.freeze({
    id: "all_lights_off",
    name: "All Lights OFF",
    badge: "Blackout",
    description: "Only LIGHT devices OFF",
    targetMode: "type_light_off",
  }),
]);

export const SMART_SCENES_BY_ID = Object.freeze(
  Object.fromEntries(SMART_SCENES.map((scene) => [scene.id, scene]))
);

export const VALID_SCENE_IDS = Object.freeze(
  SMART_SCENES.map((scene) => scene.id)
);

