# Visual refresh Implementation Plan

> **For agentic workers:** Execute inline in the current session. Track completion below.

**Goal:** Improve OncoFlow visual hierarchy and consistency across Pro and Paciente.
**Architecture:** Preserve all existing API contracts and business rules. Apply scoped layout and presentation changes to the React components and shared stylesheet.
**Tech Stack:** Existing React 19, TypeScript, Tailwind 4 and Vite.
**Spec:** `docs/superpowers/specs/2026-10-31-visual-refresh-design.md`.

## Global Constraints

- Existing brand palette and Inter; no new package or backend changes.
- Keep demo, privacy, urgency and confirmation disclosures visible.
- Preserve responsive use, font preferences and reduced motion.

## Review Focus

Patient font enlargement; mobile navigation wrapping; long names and statuses; action buttons and forms; patient/pro view separation. Check in the browser; no new test framework for these presentation changes.

## Tasks

- [x] Record passing baseline lint/build and inspect original screens.
- [x] Refine scoped presentation styles, Pro shell, login and team composition. Files: `src/visual-refresh.css`, `src/main.tsx`, `src/App.tsx`, `src/components/Navbar.tsx`, `LoginView.tsx`, `EquipeView.tsx`.
- [x] Refine patient home and supporting surfaces. Files: `src/paciente/PacienteApp.tsx`, `src/paciente/telas.tsx`; add explicit presentation classes to existing components as needed.
- [x] Run lint/build; inspect desktop/mobile, check existing navigation and a patient-to-team request with fictitious data; capture previews; review diff for unintended business changes.

## Evidence

Baseline: `npm run lint` and `npm run build` passed before edits. Work in fresh local clone on `codex/visual-refresh`, starting at `2e32798`. Network and Chrome require execution outside the Windows sandbox. No new runtime dependencies.

Final verification: `npm run lint`, `npm run build` and `git diff --check` passed. Browser checks covered patient journey, agenda, documents, check-in disclosure, urgency instructions, Lia request confirmation, team receipt/assignment/review, conversations, search and empty results, and arrow-key tab navigation. Pro widths 1440/768/390/320; patient widths 390/320 with 22 px font; login at 1440/390. No horizontal overflow in those checks. Reduced-motion preference disables the orb animation.

Visual review: final login, team and patient screenshots inspected. Existing domain limitations reported in the earlier analysis remain outside this presentation round; voice-provider calls and real hospital integrations were not exercised.

Implementation decisions: import presentation CSS directly from `main.tsx` because the development Tailwind import pipeline omitted the new nested stylesheet. Keep the displayed profile within filtered results (reproduced the previous mismatch and verified the correction); add keyboard navigation to the existing tabs. Backend and dependency manifests unchanged.

## Integration with the team's current main

Before publication, main advanced to `76a896d` with a new Pro layout. Preserve its `App`, sidebar, patient detail, search and communication layout, including the replacement of EquipeView, Navbar and PacienteCard. The earlier Pro layout and its tab verification above describe the original local round, superseded by that team update. Keep this branch's login, patient presentation, shared review/chat styling, cover-inspired logo and Lia voice experience. Remove unused presentation rules for the superseded Pro layout.
