---
name: add-component
description: How to create a new Vue component for LyricMachine
---

# Creating a New Component

1. Create `src/components/<PascalName>.vue`
2. Use `<script setup>` syntax — no Options API
3. Define props with `defineProps()` and emits with `defineEmits()`
4. Style with `<style scoped>` — use CSS variables from `src/style.css` when applicable
5. For icons, use `<MdiIcon :path="mdiIconName" />` (import icon paths from `@mdi/js`)

## Design Guidelines
- Dark theme: black background (#000000), light text (#e8e8e8)
- Accent: `#64ffda` (teal/cyan) used across the app
- Font: Inter — already loaded globally
- Overlays follow the `.overlay-backdrop` pattern in `style.css`
- Animations: prefer Web Animations API (JS hooks on `<Transition>`) over CSS transitions

## Component Checklist
- [ ] PascalCase filename
- [ ] `<script setup>` with explicit props/emits
- [ ] Scoped styles
- [ ] Keyboard accessibility where applicable
- [ ] Responsive considerations (the app is designed for desktop/TV display but should handle resize)
